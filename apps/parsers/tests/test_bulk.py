from __future__ import annotations

import json

from parsers.adapters import Adapter, LookupRequest
from parsers.bulk import import_numbers
from parsers.models import Image, NumberRef, Relationship, SourceMeta, SourceResult

SOURCE = SourceMeta(
    key="fake", name="Fake", kind="manufacturer_catalog", license_class="OPEN", lineage="fake"
)


class FakeAdapter(Adapter):
    def __init__(self, crosses: dict[str, int]):
        super().__init__(http=None)  # type: ignore[arg-type]
        self._crosses = crosses
        self.asked: list[str] = []

    @property
    def source(self) -> SourceMeta:
        return SOURCE

    @property
    def brands(self) -> tuple[str, ...]:
        return ("Fake",)

    def lookup(self, request: LookupRequest) -> SourceResult:
        self.asked.append(request.number)

        return SourceResult(
            relationships=[
                Relationship(to=NumberRef("VW", "oem", f"OE{index}"), relation_type="OEM_REFERENCE")
                for index in range(self._crosses.get(request.number, 0))
            ]
        )


class ImageOnlyAdapter(FakeAdapter):
    def lookup(self, request: LookupRequest) -> SourceResult:
        self.asked.append(request.number)
        return SourceResult(images=[Image(url="https://example.com/part.jpg")])


class FakeClient:
    def __init__(self):
        self.payloads: list[dict] = []

    def import_result(self, payload):
        self.payloads.append(payload)

        return {"summary": {"relationships_added": len(payload["result"]["relationships"])}}


def test_numbers_are_looked_up_and_imported_and_unknown_ones_skipped(tmp_path):
    client = FakeClient()
    adapter = FakeAdapter({"A 1": 3})
    progress = tmp_path / "numbers.imported.json"
    totals = import_numbers(client, [adapter], "Fake", ["A 1", "B 2"], "w", progress_path=progress, pause=0)  # type: ignore[arg-type]

    assert totals == {"numbers": 1, "unknown": 1, "relationships": 3, "applications": 0, "failed": 0}
    assert client.payloads[0]["number"] == {"brand": "Fake", "number_type": "aftermarket", "number": "A 1"}
    assert json.loads(progress.read_text()) == ["A 1", "B 2"]


def test_an_interrupted_run_resumes_and_a_long_result_goes_in_parts(tmp_path):
    client = FakeClient()
    adapter = FakeAdapter({"A 1": 3, "C 3": 1200})
    progress = tmp_path / "numbers.imported.json"
    progress.write_text(json.dumps(["A 1"]))
    totals = import_numbers(client, [adapter], "Fake", ["A 1", "C 3"], "w", progress_path=progress, pause=0)  # type: ignore[arg-type]

    assert adapter.asked == ["C 3"]
    assert [len(p["result"]["relationships"]) for p in client.payloads] == [500, 500, 200]
    assert totals["relationships"] == 1200


def test_image_only_result_is_imported(tmp_path):
    client = FakeClient()
    adapter = ImageOnlyAdapter({})

    totals = import_numbers(client, [adapter], "Fake", ["A 1"], "w", pause=0)  # type: ignore[arg-type]

    assert totals["numbers"] == 1
    assert totals["unknown"] == 0
    assert client.payloads[0]["result"]["images"] == [
        {"source": "fake", "url": "https://example.com/part.jpg"}
    ]
