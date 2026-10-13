"""Command line entry point.

    python -m parsers adapters
    python -m parsers lookup --brand Bosch --number "0 986 478 123"
    python -m parsers run
    python -m parsers import-pdf monroe
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
from pathlib import Path

from .adapters import ADAPTERS, Adapter, LookupRequest
from .client import CatalogClient
from .http import PoliteSession, RateLimiter, ResponseCache
from .worker import load_schema, run_forever, run_lookup


def build_adapters(cache_path: Path | None) -> list[Adapter]:
    limiter = RateLimiter()
    http = PoliteSession(cache=ResponseCache(cache_path), limiter=limiter)
    adapters = [adapter_class(http) for adapter_class in ADAPTERS]

    for adapter in adapters:
        if adapter.source.url:
            host = adapter.source.url.split("/")[2]
            limiter.set_interval(host, adapter.min_interval)

    return adapters


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="parsers", description=__doc__)
    parser.add_argument("--cache", default=os.environ.get("PARSERS_CACHE", ".cache/responses.sqlite"))
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("adapters", help="list the sources this service can read")

    lookup = commands.add_parser("lookup", help="look one number up and print the result")
    lookup.add_argument("--brand", required=True)
    lookup.add_argument("--number", required=True)
    lookup.add_argument("--number-type", default="aftermarket")
    lookup.add_argument("--adapter", help="use only this adapter")

    commands.add_parser("run", help="claim tasks from the catalog and post results")

    load = commands.add_parser("import-pdf", help="load a parsed PDF catalogue into the catalog")
    load.add_argument("catalogue", choices=["monroe", "kyb", "kyb-kits"])
    load.add_argument("--index", help="parsed catalogue, default .cache/index/<catalogue>.json")
    load.add_argument("--limit", type=int)

    bulk = commands.add_parser(
        "import-numbers", help="look a list of numbers up and load the results into the catalog"
    )
    bulk.add_argument("--brand", required=True)
    bulk.add_argument("--file", required=True, help="one part number per line")
    bulk.add_argument("--number-type", default="aftermarket")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    adapters = build_adapters(Path(args.cache) if args.cache else None)
    worker = os.environ.get("PARSERS_WORKER", f"parsers@{socket.gethostname()}")
    schema = load_schema()

    if args.command == "adapters":
        for adapter in adapters:
            print(f"{adapter.name}\t{adapter.version}\t{', '.join(adapter.brands)}\t{adapter.source.url}")
        print(f"{len(adapters)} adapter(s)")
        return 0

    if args.command == "lookup":
        chosen = [a for a in adapters if not args.adapter or a.name == args.adapter]
        request = LookupRequest(args.brand, args.number, args.number_type)

        if not any(adapter.supports(request) or adapter.cross_search for adapter in chosen):
            print(f"No adapter covers brand {args.brand!r}", file=sys.stderr)
            return 2

        result = run_lookup(chosen, request, worker, schema)
        print(json.dumps(result.to_payload(), ensure_ascii=False, indent=2))
        return 0

    # The key comes from the environment only; it is never an argument, so it
    # cannot end up in shell history or a process list.
    base_url = os.environ.get("CATALOG_URL")
    api_key = os.environ.get("CATALOG_API_KEY")

    if not base_url or not api_key:
        print("CATALOG_URL and CATALOG_API_KEY must be set", file=sys.stderr)
        return 2

    client = CatalogClient(base_url, api_key)

    if args.command == "import-numbers":
        from .bulk import import_numbers

        source = Path(args.file)
        numbers = [line.strip() for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
        totals = import_numbers(
            client,
            adapters,
            args.brand,
            numbers,
            worker,
            number_type=args.number_type,
            schema=schema,
            progress_path=source.with_suffix(".imported.json"),
        )
        print(json.dumps(totals))
        return 0 if not totals["failed"] else 1

    if args.command == "import-pdf":
        from .pdf.loader import load_catalogue

        index = Path(args.index or f".cache/index/{args.catalogue}.json")
        totals = load_catalogue(args.catalogue, client, index, worker, limit=args.limit)
        print(json.dumps(totals))
        return 0 if not totals["failed"] else 1

    run_forever(client, adapters, worker, schema=schema)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
