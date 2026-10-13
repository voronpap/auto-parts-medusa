"""Bulk collection through the manufacturers' catalogues, on any machine.

    python tools/harvest.py --dir harvest

One queue per site, so a site is never asked by two processes at once. A
queue first lists the catalogue's numbers for Chinese makes through its
vehicle tree, then goes through the catalogue's numbers found in suppliers'
price lists, and with --all-makes then lists the whole catalogue through the
vehicle tree of every make (lists all-<name>.txt; this takes days). Price lists (files price-<name>.txt with brands.json, prepared on the store's
server). Crosses and specifications are taken first; fitment is a second pass.

The queue "spareto" covers the brands that have no catalogue of their own:
numbers from spareto.tsv (brand key, brand, number) are looked up in the shop,
brand by brand. Its pages are kept in the local cache, not sent to the archive.

Sources whose robots.txt closes the API (MANN-FILTER, bilstein group) are not
here: they are asked one number at a time, on demand.

Safe to stop (Ctrl+C) and start again: lists are kept, loaded numbers are
skipped. Progress is written to <dir>/progress.log. The catalog address and
key are read from .env next to pyproject.toml and are never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAKES = ["CHERY", "GEELY", "BYD", "GREAT WALL", "HAVAL", "CHANGAN", "MG", "JAC", "FAW"]
# Lower priority, so the machine stays usable.
PRIORITY = {"creationflags": 0x00004000} if os.name == "nt" else {"preexec_fn": lambda: os.nice(10)}

# ("tree", name, adapter, brand, number type, list tool, extra arguments)
# ("price", name, adapter)
QUEUES: dict[str, list[tuple]] = {
    "zf": [
        ("tree", "china-trw", "zf", "TRW", "aftermarket", "zf_model_numbers.py", ["--part-brand", "TRW"]),
        ("tree", "china-sachs", "zf", "SACHS", "aftermarket", "zf_model_numbers.py", ["--part-brand", "SACHS"]),
        ("tree", "china-lemforder", "zf", "LEMFÖRDER", "aftermarket", "zf_model_numbers.py", ["--part-brand", "LEMFÖRDER"]),
        ("price", "price-lemforder", "zf"),
        ("price", "price-sachs", "zf"),
        ("price", "price-trw", "zf"),
    ],
    "bosch": [("price", "price-bosch", "bosch")],
    "nissens": [
        ("tree", "china-nissens", "nissens", "Nissens", "aftermarket", "nissens_make_numbers.py", []),
        ("price", "price-nissens", "nissens"),
    ],
    "ctr": [
        ("tree", "china-ctr", "ctr", "CTR", "aftermarket", "ctr_make_numbers.py", []),
        ("price", "price-ctr", "ctr"),
    ],
    "metelli": [
        ("tree", "china-metelli", "metelli", "Metelli", "aftermarket", "metelli_model_numbers.py", ["--part-brand", "Metelli"]),
        ("tree", "china-cifam", "metelli", "Cifam", "aftermarket", "metelli_model_numbers.py", ["--part-brand", "Cifam"]),
        ("price", "price-metelli", "metelli"),
        ("price", "price-graf", "metelli"),
    ],
    "nrf": [("price", "price-nrf", "nrf")],
    "nibk": [("tree", "china-nibk", "nibk", "NiBK", "aftermarket", "nibk_model_numbers.py", [])],
    "facet": [
        ("tree", "china-facet", "facet", "FACET", "aftermarket", "facet_model_numbers.py", []),
        ("price", "price-eps", "eps"),
    ],
    "oe": [
        ("tree", "china-geely", "geely-ksa", "Geely", "oem", "geely_ksa_model_numbers.py", None),
        ("tree", "china-mg", "mg-egypt", "MG", "oem", "mg_egypt_model_numbers.py", None),
    ],
}

def spareto_steps(work: Path, brands: dict[str, str]) -> list[tuple]:
    """Splits spareto.tsv into one list per brand, biggest brands first."""
    source = work / "spareto.tsv"

    if not source.exists():
        return []

    by_brand: dict[str, list[str]] = {}
    names: dict[str, str] = {}

    for line in source.read_text(encoding="utf-8").splitlines():
        key, _, rest = line.partition("\t")
        brand, _, number = rest.partition("\t")
        key = "".join(c for c in key if c.isalnum())

        if key and brand and number.strip():
            by_brand.setdefault(key, []).append(number.strip())
            names[key] = brand

    folder = work / "spareto"
    folder.mkdir(exist_ok=True)
    steps = []

    for key, numbers in sorted(by_brand.items(), key=lambda item: -len(item[1])):
        name = f"spareto/{key}"
        (work / f"{name}.txt").write_text("\n".join(numbers) + "\n", encoding="utf-8")
        brands[name] = names[key]
        steps.append(("price", name, "spareto"))

    return steps


stopping = threading.Event()
running: set[subprocess.Popen] = set()
lock = threading.Lock()


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}

    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.strip().partition("=")

            if separator and key and not key.startswith("#"):
                values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def run(command: list[str], env: dict[str, str], stdout: Path, stderr: Path | None) -> int:
    """Runs one step; its output goes to files, never to the screen."""
    with stdout.open("w", encoding="utf-8") as out, (stderr.open("w", encoding="utf-8") if stderr else out) as err:
        process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=out, stderr=err, **PRIORITY)

        with lock:
            running.add(process)

        try:
            return process.wait()
        finally:
            with lock:
                running.discard(process)


def queue(name: str, steps: list[tuple], work: Path, env: dict[str, str], brands: dict[str, str]) -> None:
    def note(text: str) -> None:
        with lock, (work / "progress.log").open("a", encoding="utf-8") as log:
            log.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {text}\n")

    for step in steps:
        if stopping.is_set():
            return

        kind, step_name, adapter = step[0], step[1], step[2]
        numbers = work / f"{step_name}.txt"

        if kind == "tree":
            brand, number_type, tool, extra = step[3], step[4], step[5], step[6]

            if not numbers.exists() or not numbers.stat().st_size:
                note(f"{step_name}: listing")
                command = [sys.executable, f"tools/{tool}", "--cache", str(work / f"cache-{adapter}.sqlite")]

                if extra is not None:
                    command += [*extra, "--brands", *(step[7] if len(step) > 7 else MAKES)]

                partial = work / f"{step_name}.tmp"
                code = 1

                # A catalogue that drops a connection is asked again; what it
                # already answered comes from the cache.
                for attempt in range(40):
                    if stopping.is_set():
                        break

                    code = run(command, env, partial, work / f"{step_name}.list.log")

                    if code == 0:
                        break

                    note(f"{step_name}: listing failed, attempt {attempt + 1}")
                    time.sleep(60)

                if code == 0 and not stopping.is_set():
                    partial.replace(numbers)
                else:
                    note(f"{step_name}: the list was not built (see {step_name}.list.log)")
        else:
            brand, number_type = brands.get(step_name, ""), "aftermarket"

        if stopping.is_set():
            return

        if not numbers.exists() or not numbers.stat().st_size or not brand:
            note(f"{step_name}: nothing to load")
            continue

        count = sum(1 for line in numbers.read_text(encoding="utf-8").splitlines() if line.strip())
        note(f"{step_name}: {count} numbers, loading")
        log = work / f"{step_name}.import.log"
        run(
            [
                sys.executable, "-m", "parsers", "--cache", str(work / f"cache-{adapter}.sqlite"),
                "import-numbers", "--brand", brand, "--adapter", adapter,
                "--number-type", number_type, "--file", str(numbers),
            ],
            {
                **env,
                "PARSERS_WORKER": f"harvest-{step_name}".replace("/", "-"),
                **({"PARSERS_NO_ARCHIVE": "1"} if adapter == "spareto" else {}),
            },
            log,
            None,
        )
        last = (log.read_text(encoding="utf-8", errors="replace").strip().splitlines() or [""])[-1]
        note(f"{step_name}: {last[:200]}")

    note(f"{name} queue done")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", default="harvest", help="lists, caches and logs are kept here")
    parser.add_argument("--only", nargs="+", choices=sorted([*QUEUES, "spareto"]), help="run only these queues")
    parser.add_argument("--normal-priority", action="store_true", help="do not lower the priority of the work")
    parser.add_argument(
        "--spool", action="store_true",
        help="keep results in <dir>/spool instead of sending them; load them later with --upload",
    )
    parser.add_argument("--upload", action="store_true", help="load what --spool kept into the store, then exit")
    parser.add_argument("--catalog-url", help="load into this store instead of the one in .env, e.g. a local copy")
    parser.add_argument("--all-makes", action="store_true", help="after the rest, list each catalogue for every make")
    parser.add_argument("--with-fitment", action="store_true", help="second pass: read fitment too")
    args = parser.parse_args()
    work = (ROOT / args.dir).resolve()
    work.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, **read_env(ROOT / ".env"), "PARSERS_INTERVAL": "2", "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}

    if not args.with_fitment:
        env["PARSERS_SKIP_FITMENT"] = "1"

    if not env.get("CATALOG_URL") or not env.get("CATALOG_API_KEY"):
        print("CATALOG_URL and CATALOG_API_KEY must be set in .env", file=sys.stderr)
        return 2

    if args.catalog_url:
        env["CATALOG_URL"] = args.catalog_url

    if args.spool:
        env["PARSERS_SPOOL_DIR"] = str(work / "spool")

    if args.upload:
        return run(
            [sys.executable, "-m", "parsers", "upload-spool", "--dir", str(work / "spool")],
            env, work / "upload.log", None,
        )

    brands_file = work / "brands.json"
    brands = json.loads(brands_file.read_text(encoding="utf-8")) if brands_file.exists() else {}
    QUEUES["spareto"] = spareto_steps(work, brands) if not args.only or "spareto" in args.only else []

    if args.normal_priority:
        PRIORITY.clear()

    if args.all_makes:
        makes_file = work / "makes.txt"
        every = [m.strip() for m in makes_file.read_text(encoding="utf-8").splitlines() if m.strip()] if makes_file.exists() else []

        for steps in QUEUES.values():
            for step in [s for s in steps if s[0] == "tree" and s[6] is not None]:
                # CTR is searched by the name of a make; the others walk their own list.
                makes = every if step[5] == "ctr_make_numbers.py" else ["*"]

                if makes:
                    steps.append((*step[:1], step[1].replace("china-", "all-"), *step[2:], makes))
    threads = [
        threading.Thread(target=queue, args=(name, steps, work, env, brands), name=name)
        for name, steps in QUEUES.items()
        if steps and (not args.only or name in args.only)
    ]
    print(f"{len(threads)} queues started; progress: {work / 'progress.log'}  (Ctrl+C stops)")

    for thread in threads:
        thread.start()

    try:
        while any(thread.is_alive() for thread in threads):
            time.sleep(1)
    except KeyboardInterrupt:
        stopping.set()

        with lock:
            for process in running:
                process.terminate()

        print("stopping…")

    for thread in threads:
        thread.join()

    print("all queues done" if not stopping.is_set() else "stopped; start again to continue")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
