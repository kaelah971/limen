import { z } from "zod";
import {
  LimenDecisionResultSchema,
} from "../../core/src";
import type { PersistedRunDetail } from "./types";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const CVE_ID = /^CVE-\d{4}-\d{4,}$/i;
const LEDGER_RUN_ID = /^LM-RUN-[A-Z0-9][A-Z0-9-]{2,127}$/;

const TimestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "must be a valid timestamp",
);

const NonNegativeNumberSchema = z.number().finite().min(0);
const NonNegativeIntegerSchema = z.number().int().min(0);

export const LedgerRunIdSchema = z.string().regex(LEDGER_RUN_ID);
export const LedgerCveIdSchema = z.string().regex(CVE_ID, "must be a CVE identifier");

export const LedgerUsageClassSchema = z.enum([
  "production",
  "demo",
  "development",
  "test",
]);

export const LedgerSourceSchema = z.enum(["action", "backfill"]);

export const LedgerRunMetadataSchema = z
  .object({
    id: LedgerRunIdSchema.optional(),
    repository: z.string().regex(/^[^\s/]+\/[^\s/]+$/).max(255),
    pullRequestNumber: z.number().int().positive(),
    baseSha: z.string().regex(FULL_SHA, "must be a full commit SHA"),
    headSha: z.string().regex(FULL_SHA, "must be a full commit SHA"),
    githubRunId: z.number().int().positive(),
    githubRunAttempt: z.number().int().positive(),
    githubEvent: z.enum(["pull_request", "pull_request_target"]),
    actor: z.string().min(1).max(255),
    policyVersion: z.string().min(1).max(64),
    overallDecision: z.enum(["PASS", "HOLD", "REVIEW"]),
    runReasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
    runSummary: z.string().min(1).max(4000),
    decisionCount: NonNegativeIntegerSchema,
    passCount: NonNegativeIntegerSchema,
    holdCount: NonNegativeIntegerSchema,
    reviewCount: NonNegativeIntegerSchema,
    telegraphRequestCount: NonNegativeIntegerSchema,
    telegraphCostUsd: NonNegativeNumberSchema,
    evaluatedCves: z.array(LedgerCveIdSchema).max(100),
    skippedCves: z.array(LedgerCveIdSchema).max(100),
    isTest: z.boolean(),
    usageClass: LedgerUsageClassSchema,
    source: LedgerSourceSchema,
    startedAt: TimestampSchema,
    completedAt: TimestampSchema,
  })
  .strict();

export const PersistedLedgerRunMetadataSchema = LedgerRunMetadataSchema.extend({
  id: LedgerRunIdSchema,
});

export const SafeTelegraphRequestRecordSchema = z
  .object({
    cveId: LedgerCveIdSchema,
    intent: z.literal("CVE_LOOKUP"),
    minerId: z.string().max(512).nullable(),
    minerName: z.string().max(512).nullable(),
    costUsd: NonNegativeNumberSchema.nullable(),
    durationMs: NonNegativeIntegerSchema.nullable(),
    network: z.string().max(128).nullable(),
    paymentScheme: z.string().max(128).nullable(),
    requestedAt: TimestampSchema,
    receivedAt: TimestampSchema.nullable(),
    outcome: z.enum(["success", "failed"]),
    settlementReference: z.string().max(255).nullable(),
  })
  .strict();

export const LedgerRunIngestSchema = z
  .object({
    run: LedgerRunMetadataSchema,
    decisions: z.array(LimenDecisionResultSchema).max(100),
    telegraphRequests: z.array(SafeTelegraphRequestRecordSchema).max(100),
  })
  .strict();

export const PersistedRunSchema = z
  .object({
    id: LedgerRunIdSchema,
    created: z.boolean(),
  })
  .strict();

export const PersistedRunDetailSchema = z
  .object({
    run: PersistedLedgerRunMetadataSchema,
    decisions: z.array(LimenDecisionResultSchema),
    telegraphRequests: z.array(SafeTelegraphRequestRecordSchema),
  })
  .strict();

export function isLedgerRunId(value: string): boolean {
  return LEDGER_RUN_ID.test(value);
}

export function validatePersistedRunDetail(
  value: unknown,
): PersistedRunDetail {
  return PersistedRunDetailSchema.parse(value) as PersistedRunDetail;
}

export type ValidatedLedgerRunMetadata = z.infer<typeof LedgerRunMetadataSchema>;
