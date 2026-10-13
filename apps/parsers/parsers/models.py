"""Records an adapter returns, in the shape the catalog's lookup API accepts.

Adapters report what a source says and nothing more: numbers are passed as
written, the source's own wording is kept, and no verdict is given.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


def _drop_none(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None}


@dataclass(frozen=True)
class NumberRef:
    brand: str
    number_type: str
    number: str


@dataclass(frozen=True)
class SourceMeta:
    """Describes one source. `name` must match the catalog's source registry."""

    key: str
    name: str
    kind: str
    license_class: str
    lineage: str
    url: str | None = None
    license_note: str | None = None
    catalog_version: str | None = None


@dataclass
class Relationship:
    to: NumberRef | None
    relation_type: str
    raw_relation_text: str | None = None
    direction: str | None = None
    ambiguous: bool = False
    constraints: dict[str, Any] | None = None
    reason: str | None = None
    record_ref: str | None = None
    record_url: str | None = None


@dataclass
class Application:
    make: str
    model: str | None = None
    generation: str | None = None
    body: str | None = None
    market: str | None = None
    year_from: int | None = None
    year_to: int | None = None
    engine: str | None = None
    engine_code: str | None = None
    power_kw: float | None = None
    fuel: str | None = None
    drivetrain: str | None = None
    transmission: str | None = None
    position: str | None = None
    side: str | None = None
    quantity: float | None = None
    constraints: dict[str, Any] | None = None
    raw_text: str | None = None
    record_ref: str | None = None
    record_url: str | None = None


@dataclass
class Attribute:
    name: str
    value: str
    unit: str | None = None
    raw_text: str | None = None


@dataclass
class SourceResult:
    """Everything one adapter found for one number."""

    relationships: list[Relationship] = field(default_factory=list)
    applications: list[Application] = field(default_factory=list)
    attributes: list[Attribute] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not (self.relationships or self.applications or self.attributes)


@dataclass
class LookupResult:
    """Merged output of all adapters for one task, ready to post."""

    worker: str
    sources: list[dict[str, Any]] = field(default_factory=list)
    relationships: list[dict[str, Any]] = field(default_factory=list)
    applications: list[dict[str, Any]] = field(default_factory=list)
    attributes: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    #: Raw responses the result was read from. They go to the catalog's
    #: archive separately and are not part of the result itself.
    documents: list[dict[str, Any]] = field(default_factory=list)

    def add(
        self,
        source: SourceMeta,
        parser_name: str,
        parser_version: str,
        result: SourceResult,
        retrieved_at: datetime | None = None,
    ) -> None:
        if result.is_empty:
            return

        moment = retrieved_at or datetime.now(timezone.utc)
        self.sources.append(
            _drop_none(
                {
                    **asdict(source),
                    "parser": {"name": parser_name, "version": parser_version},
                    "retrieved_at": moment.strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
        )

        for relationship in result.relationships:
            record = _drop_none(asdict(relationship))
            # A terminal relation has no target, and the API expects the key.
            record["to"] = asdict(relationship.to) if relationship.to else None
            self.relationships.append({"source": source.key, **record})

        for application in result.applications:
            self.applications.append(
                {"source": source.key, **_drop_none(asdict(application))}
            )

        for attribute in result.attributes:
            self.attributes.append(
                {"source": source.key, **_drop_none(asdict(attribute))}
            )

    def add_error(self, source_key: str, message: str) -> None:
        self.errors.append({"source": source_key, "message": message[:2000]})

    def to_payload(self) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("documents")

        return payload
