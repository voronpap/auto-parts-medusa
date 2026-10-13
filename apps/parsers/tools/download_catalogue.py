"""Download a public catalogue through PoliteSession and save its raw record.

No store API call is made. The owner can archive the JSON sidecar later;
its UTF-8 body is a standard data URI containing the original binary bytes.
Output files are created exclusively, never overwriting existing data.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers.http import PoliteSession, RateLimiter, ResponseCache, SourceError


def download(http, url, output, record_output, source_key, source_name, parser_version):
    address = urlsplit(url)
    if address.scheme != "https" or address.username is not None or address.password is not None:
        raise ValueError("Use an anonymous HTTPS catalogue URL")
    output, record_output = Path(output), Path(record_output)
    if output.resolve() == record_output.resolve() or output.exists() or record_output.exists():
        raise FileExistsError("Catalogue and raw-record output paths must be distinct and new")
    previous = http.recorder
    http.recorder = []
    try:
        content = http.fetch_bytes(url)
        documents = [{**d, "source_key": source_key, "source_name": source_name,
                      "parser_name": source_key, "parser_version": parser_version} for d in http.recorder]
    finally:
        http.recorder = previous
    if output.suffix.lower() == ".pdf" and not content.startswith(b"%PDF-"):
        raise SourceError("The public catalogue response is not a PDF")
    if output.suffix.lower() == ".xlsx" and not content.startswith(b"PK\x03\x04"):
        raise SourceError("The public catalogue response is not an XLSX ZIP")
    output.parent.mkdir(parents=True, exist_ok=True)
    record_output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as stream:
        stream.write(content)
    with record_output.open("x", encoding="utf-8") as stream:
        json.dump({"documents": documents}, stream, ensure_ascii=False)
    return {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(), "documents": len(documents)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--record-output", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--source-key", required=True)
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--parser-version", default="1.0.0")
    args = parser.parse_args()
    http = PoliteSession(cache=ResponseCache(args.cache), limiter=RateLimiter(5))
    print(json.dumps(download(http, args.url, args.output, args.record_output, args.source_key, args.source_name, args.parser_version)))


if __name__ == "__main__":
    main()
