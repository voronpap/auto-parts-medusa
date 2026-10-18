import { createHash } from "node:crypto";
import { normalizeBrandName, normalizePartNumber } from "./normalize";

type ImportIdentityInput = {
  number: {
    brand: string;
    number_type: string;
    number: string;
  };
  result: Record<string, unknown>;
};

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function canonicalize(
  value: unknown,
  propertyName?: string,
  isRoot = false,
): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalize(item, propertyName));

    return propertyName === "images"
      ? items
      : items.sort((left, right) =>
          stableJson(left) < stableJson(right)
            ? -1
            : stableJson(left) > stableJson(right)
              ? 1
              : 0,
        );
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !(key === "worker" && isRoot) &&
            !(key === "retrieved_at" && propertyName === "sources"),
        )
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item, key)]),
    );
  }

  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createImportIdempotencyIdentity(input: ImportIdentityInput) {
  const naturalKey = {
    brand: normalizeBrandName(input.number.brand),
    number_type: input.number.number_type,
    number: normalizePartNumber(input.number.number),
  };
  const requestHash = sha256(
    stableJson(canonicalize(input.result, undefined, true)),
  );
  const idempotencyKey = sha256(
    JSON.stringify({ ...naturalKey, request_hash: requestHash }),
  );

  return {
    idempotencyKey,
    requestHash,
  };
}
