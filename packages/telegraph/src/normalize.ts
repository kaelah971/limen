import {
  TelegraphNormalizationError,
  type LimenError,
} from "../../core/src/errors/errors";
import {
  normalizeSeverity,
  redactSecrets,
  type Severity,
  type TelegraphCveEvidence,
} from "../../core/src/index";
import type { PreparedPayment } from "./types";

export interface TelegraphNormalizationContext {
  requestedAt: string;
  receivedAt?: string | null;
  payment?: Pick<PreparedPayment, "network" | "scheme" | "costUsd">;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function candidateRecords(raw: unknown): UnknownRecord[] {
  const root = asRecord(raw);
  if (!root) {
    return [];
  }

  const records: UnknownRecord[] = [root];
  for (const key of ["result", "data", "output", "response", "evidence"]) {
    const nested = asRecord(root[key]);
    if (nested) {
      records.push(nested);
      const nestedResult = asRecord(nested.result) ?? asRecord(nested.data);
      if (nestedResult) {
        records.push(nestedResult);
      }
    }
  }
  return records;
}

function firstValue(records: UnknownRecord[], keys: string[]): unknown {
  for (const record of records) {
    for (const key of keys) {
      if (key in record) {
        return record[key];
      }
    }
  }
  return undefined;
}

function allValues(records: UnknownRecord[], keys: string[]): unknown[] {
  return records.flatMap((record) =>
    keys.filter((key) => key in record).map((key) => record[key]),
  );
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoundedNumber(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = readNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function readStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return readString(value) ? [value.trim()] : null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeCveId(records: UnknownRecord[]): string | null {
  const values = allValues(records, ["cveId", "cve_id", "cve"])
    .map(readString)
    .filter((value): value is string => value !== null);

  if (values.length === 0) {
    return null;
  }

  const normalized = values.map((value) =>
    /^CVE-\d{4}-\d{4,}$/i.test(value) ? value.toUpperCase() : null,
  );
  if (normalized.some((value) => value === null)) {
    return null;
  }

  const unique = new Set(normalized);
  return unique.size === 1 ? normalized[0] : null;
}

function readSeverity(records: UnknownRecord[]): Severity | null {
  const values = allValues(records, ["severity", "baseSeverity"])
    .filter((value) => value !== undefined && value !== null)
    .map(normalizeSeverity);
  const unique = [...new Set(values)];
  if (unique.length > 1) {
    throw new TelegraphNormalizationError(
      "Telegraph returned conflicting severity values.",
      { field: "severity", values: unique },
    );
  }
  return unique[0] ?? null;
}

function readCvss(records: UnknownRecord[]): number | null {
  const value = firstValue(records, ["cvssScore", "cvss_score", "cvss"]);
  const cvssRecord = asRecord(value);
  return readBoundedNumber(
    cvssRecord ? firstValue([cvssRecord], ["baseScore", "base_score", "score"]) : value,
    0,
    10,
  );
}

function readCostUsd(records: UnknownRecord[]): number | null {
  const explicit = firstValue(records, ["costUsd", "cost_usd", "costUSD"]);
  const explicitNumber = readNumber(explicit);
  if (explicitNumber !== null && explicitNumber >= 0) {
    return explicitNumber;
  }

  const cost = firstValue(records, ["cost"]);
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
    return cost;
  }
  if (typeof cost === "string" && /^\s*\$\s*\d+(?:\.\d+)?\s*$/.test(cost)) {
    return readNumber(cost.replace(/[$\s]/g, ""));
  }
  return null;
}

function readDurationMs(records: UnknownRecord[]): number | null {
  const duration = readNumber(
    firstValue(records, ["durationMs", "duration_ms", "latencyMs", "latency_ms", "duration"]),
  );
  return duration !== null && duration >= 0 ? Math.round(duration) : null;
}

function readProvenance(records: UnknownRecord[]): {
  minerId: string | null;
  minerName: string | null;
} {
  const provenanceRecords = records.flatMap((record) => {
    const values = [record.miner, record.provenance, record.metadata];
    return values.map(asRecord).filter((value): value is UnknownRecord => value !== null);
  });
  return {
    minerId:
      readString(firstValue(records, ["minerId", "miner_id", "miner_used"])) ??
      readString(firstValue(provenanceRecords, ["id"])),
    minerName:
      readString(firstValue(records, ["minerName", "miner_name"])) ??
      readString(firstValue(provenanceRecords, ["name"])),
  };
}

export function normalizeTelegraphEvidence(
  raw: unknown,
  context: TelegraphNormalizationContext,
): TelegraphCveEvidence {
  if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    throw new TelegraphNormalizationError(
      "Telegraph returned a response that is not an object.",
      { responseType: Array.isArray(raw) ? "array" : typeof raw },
    );
  }

  const records = candidateRecords(raw);
  const provenance = readProvenance(records);
  const receivedAt =
    readString(firstValue(records, ["receivedAt", "received_at"])) ??
    context.receivedAt ??
    null;
  const network = context.payment?.network ?? readString(firstValue(records, ["network"])) ?? null;
  const paymentScheme =
    context.payment?.scheme ??
    readString(firstValue(records, ["paymentScheme", "payment_scheme", "scheme"])) ??
    null;

  return {
    cveId: normalizeCveId(records),
    severity: readSeverity(records),
    cvssScore: readCvss(records),
    description: readString(firstValue(records, ["description", "summary"])),
    references: readStringArray(firstValue(records, ["references", "refs"])) ?? [],
    affectedVersions: readStringArray(
      firstValue(records, ["affectedVersions", "affected_versions"]),
    ),
    fixedVersions: readStringArray(
      firstValue(records, ["fixedVersions", "fixed_versions"]),
    ),
    fixAvailable: readBoolean(
      firstValue(records, ["fixAvailable", "fix_available"]),
    ),
    intent: "CVE_LOOKUP",
    minerId: provenance.minerId,
    minerName: provenance.minerName,
    timestamp: readString(firstValue(records, ["timestamp", "time"])),
    reasoning: readString(firstValue(records, ["reasoning"])),
    endpoint: readString(firstValue(records, ["endpoint"])),
    costUsd: readCostUsd(records) ?? context.payment?.costUsd ?? null,
    durationMs: readDurationMs(records),
    network,
    paymentScheme,
    requestedAt: context.requestedAt,
    receivedAt,
    raw: redactSecrets(raw),
  };
}

export function isNormalizationError(error: unknown): error is LimenError {
  return error instanceof TelegraphNormalizationError;
}
