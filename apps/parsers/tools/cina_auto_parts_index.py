"""Build/find a literal Cina table index; never imports unresolved codes."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.pdf.cina_auto_parts import build_index, find_rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("pdf", type=Path)
    build.add_argument("--output", type=Path, required=True)
    find = sub.add_parser("find")
    find.add_argument("index", type=Path)
    find.add_argument("--number", required=True)
    find.add_argument("--car-brand-label")
    args = parser.parse_args()
    if args.command == "build":
        if args.output.exists():
            raise FileExistsError("Index output must be a new file")
        index = build_index(args.pdf)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as stream:
            json.dump(index, stream, ensure_ascii=False, indent=2)
        print(json.dumps({"pages": index["pages"], "rows": len(index["rows"]),
                          "labels": sorted({r["car_brand_label"] for r in index["rows"]}),
                          "sha256": index["sha256"]}, ensure_ascii=True))
    else:
        index = json.loads(args.index.read_text(encoding="utf-8"))
        print(json.dumps(find_rows(index, args.number, args.car_brand_label), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
