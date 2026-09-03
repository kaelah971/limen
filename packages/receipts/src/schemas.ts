import { z } from "zod";
import { RECEIPT_SCHEMA_VERSION } from "./types";

const TimestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "must be a valid timestamp",
);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, "must be a SHA-256 hash");
const ReceiptIdSchema = z.string().regex(/^LM-REC-[A-Z0-9][A-Z0-9-]{2,127}$/);

export const PublicReceiptRepositoryEvidenceSchema = z.object({
  packageName: z.string().min(1),
  ecosystem: z.string().min(1),
  installedVersion: z.string().nullable(),
  vulnerableRange: z.string().nullable(),
  firstPatchedVersion: z.string().nullable(),
  cveId: z.string().min(1),
  severity: z.string().nullable(),
  cvssScore: z.number().min(0).max(10).nullable(),
  manifestPath: z.string().nullable(),
  scope: z.string().min(1),
  relationship: z.string().min(1),
  exposureState: z.string().min(1),
  source: z.string().min(1),
}).strict();

export const PublicReceiptTelegraphEvidenceSchema = z.object({
  cveId: z.string().nullable(),
  severity: z.string().nullable(),
  cvssScore: z.number().min(0).max(10).nullable(),
  description: z.string().nullable(),
  references: z.array(z.string()),
  affectedVersions: z.array(z.string()).nullable(),
  fixedVersions: z.array(z.string()).nullable(),
  fixAvailable: z.boolean().nullable(),
  intent: z.literal("CVE_LOOKUP"),
  minerName: z.string().nullable(),
  timestamp: TimestampSchema.nullable(),
  reasoning: z.string().nullable(),
  costUsd: z.number().finite().min(0).nullable(),
  durationMs: z.number().int().min(0).nullable(),
  network: z.string().nullable(),
  paymentScheme: z.string().nullable(),
  requestedAt: TimestampSchema.nullable(),
  receivedAt: TimestampSchema.nullable(),
}).strict();

export const PublicReceiptCheckSchema = z.object({
  label: z.string().min(1),
  outcome: z.enum(["pass", "fail", "unknown"]),
  evidence: z.string().optional(),
}).strict();

export const PublicReceiptDecisionSchema = z.object({
  decision: z.enum(["PASS", "HOLD", "REVIEW"]),
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
  summary: z.string().min(1),
  cveId: z.string().min(1),
  repositoryEvidence: PublicReceiptRepositoryEvidenceSchema,
  telegraphEvidence: PublicReceiptTelegraphEvidenceSchema.nullable(),
  checks: z.array(PublicReceiptCheckSchema).max(100),
  evaluatedAt: TimestampSchema.nullable(),
  policyVersion: z.string().min(1),
}).strict();

export const PublicReceiptTelegraphRequestSchema = z.object({
  cveId: z.string().min(1),
  intent: z.literal("CVE_LOOKUP"),
  minerName: z.string().nullable(),
  costUsd: z.number().finite().min(0).nullable(),
  durationMs: z.number().int().min(0).nullable(),
  network: z.string().nullable(),
  paymentScheme: z.string().nullable(),
  requestedAt: TimestampSchema.nullable(),
  receivedAt: TimestampSchema.nullable(),
  outcome: z.enum(["success", "failed"]),
}).strict();

export const PublicReceiptReleaseSchema = z.object({
  repository: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  baseSha: z.string().regex(/^[0-9a-f]{40}$/i),
  headSha: z.string().regex(/^[0-9a-f]{40}$/i),
  githubEvent: z.enum(["pull_request", "pull_request_target"]),
  actor: z.string().min(1),
  policyVersion: z.string().min(1),
  overallDecision: z.enum(["PASS", "HOLD", "REVIEW"]),
  runReasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
  runSummary: z.string().min(1),
  decisionCount: z.number().int().min(0),
  passCount: z.number().int().min(0),
  holdCount: z.number().int().min(0),
  reviewCount: z.number().int().min(0),
  telegraphRequestCount: z.number().int().min(0),
  telegraphCostUsd: z.number().finite().min(0),
  evaluatedCves: z.array(z.string().min(1)).max(100),
  skippedCves: z.array(z.string().min(1)).max(100),
  usageClass: z.enum(["production", "demo", "development", "test"]),
  source: z.enum(["action", "backfill"]),
  startedAt: TimestampSchema,
  completedAt: TimestampSchema,
}).strict();

export const ReceiptSnapshotSchema = z.object({
  schemaVersion: z.literal(RECEIPT_SCHEMA_VERSION),
  release: PublicReceiptReleaseSchema,
  decisions: z.array(PublicReceiptDecisionSchema).max(100),
  telegraphRequests: z.array(PublicReceiptTelegraphRequestSchema).max(100),
}).strict();

export const ReceiptSchema = z.object({
  id: ReceiptIdSchema,
  schemaVersion: z.literal(RECEIPT_SCHEMA_VERSION),
  snapshotHash: Sha256Schema,
  publishedAt: TimestampSchema,
  snapshot: ReceiptSnapshotSchema,
}).strict();

export const ReceiptPublicationSchema = z.object({
  id: ReceiptIdSchema,
  runId: z.string().regex(/^LM-RUN-[A-Z0-9][A-Z0-9-]{2,127}$/),
  schemaVersion: z.literal(RECEIPT_SCHEMA_VERSION),
  snapshotHash: Sha256Schema,
  publishedAt: TimestampSchema,
  revokedAt: TimestampSchema.nullable(),
  created: z.boolean(),
}).strict();

export const ReceiptPublicationRequestSchema = z.object({
  runId: z.string().regex(/^LM-RUN-[A-Z0-9][A-Z0-9-]{2,127}$/),
}).strict();

export const ReceiptIdParamSchema = ReceiptIdSchema;

export type ValidatedReceiptSnapshot = z.infer<typeof ReceiptSnapshotSchema>;
