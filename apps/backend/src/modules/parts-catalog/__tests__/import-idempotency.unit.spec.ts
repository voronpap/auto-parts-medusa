import { createImportIdempotencyIdentity } from "../utils/import-idempotency";

const request = {
  number: {
    brand: "MANN-FILTER",
    number_type: "aftermarket",
    number: "W 712/95",
  },
  result: {
    worker: "parser-1",
    sources: [
      {
        key: "catalog",
        name: "Catalog",
        retrieved_at: "2026-10-16T10:00:00.000Z",
      },
    ],
    relationships: [],
    applications: [],
    attributes: [],
    images: [],
    errors: [],
  },
};

describe("createImportIdempotencyIdentity", () => {
  it("ignores retrieval timestamps and worker delivery identity", () => {
    const first = createImportIdempotencyIdentity(request);
    const retry = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        worker: "parser-2",
        sources: [
          {
            ...request.result.sources[0],
            retrieved_at: "2026-10-17T10:00:00.000Z",
          },
        ],
      },
    });

    expect(retry).toEqual(first);
  });

  it("normalizes the natural key and object property order", () => {
    const retry = createImportIdempotencyIdentity({
      number: {
        brand: "mann filter",
        number_type: "aftermarket",
        number: "W71295",
      },
      result: {
        errors: [],
        images: [],
        attributes: [],
        applications: [],
        relationships: [],
        sources: [
          {
            retrieved_at: "ignored",
            name: "Catalog",
            key: "catalog",
          },
        ],
      },
    });

    expect(retry).toEqual(createImportIdempotencyIdentity(request));
  });

  it("changes the receipt key when an imported fact changes", () => {
    const changed = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        attributes: [{ source: "catalog", name: "height", value: "90" }],
      },
    });

    expect(changed.idempotencyKey).not.toBe(
      createImportIdempotencyIdentity(request).idempotencyKey,
    );
  });

  it("treats unordered fact collections as sets but preserves image order", () => {
    const first = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        attributes: [
          { source: "catalog", name: "width", value: "10" },
          { source: "catalog", name: "height", value: "20" },
        ],
        images: [
          { source: "catalog", url: "https://example.test/1.jpg" },
          { source: "catalog", url: "https://example.test/2.jpg" },
        ],
      },
    });
    const reorderedFacts = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        attributes: [
          { source: "catalog", name: "height", value: "20" },
          { source: "catalog", name: "width", value: "10" },
        ],
        images: [
          { source: "catalog", url: "https://example.test/1.jpg" },
          { source: "catalog", url: "https://example.test/2.jpg" },
        ],
      },
    });
    const reorderedImages = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        attributes: [
          { source: "catalog", name: "width", value: "10" },
          { source: "catalog", name: "height", value: "20" },
        ],
        images: [
          { source: "catalog", url: "https://example.test/2.jpg" },
          { source: "catalog", url: "https://example.test/1.jpg" },
        ],
      },
    });

    expect(reorderedFacts).toEqual(first);
    expect(reorderedImages.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("does not discard business fields named worker or retrieved_at", () => {
    const original = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        applications: [
          {
            constraints: {
              worker: "vehicle-side",
              retrieved_at: "source-defined-value",
            },
          },
        ],
      },
    });
    const changed = createImportIdempotencyIdentity({
      ...request,
      result: {
        ...request.result,
        applications: [
          {
            constraints: {
              worker: "different-side",
              retrieved_at: "source-defined-value",
            },
          },
        ],
      },
    });

    expect(changed.idempotencyKey).not.toBe(original.idempotencyKey);
  });
});
