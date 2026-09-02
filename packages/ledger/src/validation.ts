import { redactSecrets } from "../../core/src";
import {
  LedgerRunIngestSchema,
} from "./schemas";
import type { LedgerRunIngest } from "./types";

const FORBIDDEN_KEYS = new Set([
  "privatekey",
  "seed",
  "mnemonic",
  "paymentsignature",
  "paymentproof",
  "authorization",
  "githubtoken",
  "token",
  "authheader",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "secret",
  "secrets",
  "password",
  "passphrase",
  "walletkey",
  "walletcredential",
  "servicerolekey",
  "supabaseservicerolekey",
]);

export class LedgerValidationError extends Error {
  readonly code = "LEDGER_VALIDATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "LedgerValidationError";
  }
}

function normalizedKey(key: string): string {
  return key.replace(/[_ -]/g, "").toLowerCase();
}

function findForbiddenKey(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findForbiddenKey(value[index], [...path, `[${index}]`]);
      if (result !== null) {
        return result;
      }
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) {
      return nextPath.join(".");
    }
    const result = findForbiddenKey(nestedValue, nextPath);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

function assertRunConsistency(input: LedgerRunIngest): void {
  const { run, decisions, telegraphRequests } = input;
  const decisionCounts = {
    PASS: decisions.filter((decision) => decision.decision === "PASS").length,
    HOLD: decisions.filter((decision) => decision.decision === "HOLD").length,
    REVIEW: decisions.filter((decision) => decision.decision === "REVIEW").length,
  };

  if (
    run.decisionCount !== decisions.length ||
    run.passCount !== decisionCounts.PASS ||
    run.holdCount !== decisionCounts.HOLD ||
    run.reviewCount !== decisionCounts.REVIEW
  ) {
    throw new LedgerValidationError("Run decision counts do not match canonical decisions.");
  }

  if (run.telegraphRequestCount !== telegraphRequests.length) {
    throw new LedgerValidationError("Telegraph request count does not match request records.");
  }

  if (run.isTest !== (run.usageClass !== "production")) {
    throw new LedgerValidationError("isTest must match the non-production usage class.");
  }

  const decisionIds = new Set<string>();
  for (const decision of decisions) {
    if (decisionIds.has(decision.id)) {
      throw new LedgerValidationError("Decision IDs must be unique within a run.");
    }
    decisionIds.add(decision.id);

    if (decision.policyVersion !== run.policyVersion) {
      throw new LedgerValidationError("Decision policy versions must match the run policy.");
    }
    if (decision.cveId !== decision.repositoryEvidence.cveId) {
      throw new LedgerValidationError("Decision CVE identity must match repository evidence.");
    }
  }

  const requestCves = new Set<string>();
  for (const request of telegraphRequests) {
    if (requestCves.has(request.cveId)) {
      throw new LedgerValidationError("Telegraph CVE request records must be unique within a run.");
    }
    requestCves.add(request.cveId);
  }
}

export function validateLedgerRunIngest(value: unknown): LedgerRunIngest {
  const forbiddenPath = findForbiddenKey(value);
  if (forbiddenPath !== null) {
    throw new LedgerValidationError(
      `Payload contains a prohibited credential field at ${forbiddenPath}.`,
    );
  }

  const redacted = redactSecrets(value);
  const parsed = LedgerRunIngestSchema.safeParse(redacted);
  if (!parsed.success) {
    throw new LedgerValidationError("Payload does not match the Limen ledger contract.");
  }

  assertRunConsistency(parsed.data);
  return parsed.data;
}
