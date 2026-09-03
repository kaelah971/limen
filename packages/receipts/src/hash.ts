import { createHash } from "node:crypto";
import type { ReceiptSnapshot } from "./types";

function canonicalValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not support non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalValue(record[key])}`
    ));
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("Canonical JSON does not support undefined or function values.");
}

export function canonicalizeJson(value: unknown): string {
  return canonicalValue(value);
}

export function hashReceiptSnapshot(snapshot: ReceiptSnapshot): string {
  return createHash("sha256")
    .update(canonicalizeJson(snapshot), "utf8")
    .digest("hex");
}
