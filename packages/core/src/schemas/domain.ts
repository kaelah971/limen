import { z } from "zod";

export const SeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "UNKNOWN",
]);

export const DependencyScopeSchema = z.enum([
  "runtime",
  "development",
  "unknown",
]);

export const DependencyRelationshipSchema = z.enum([
  "direct",
  "transitive",
  "unknown",
]);

export const RepositoryExposureStateSchema = z.enum([
  "affected",
  "patched",
  "not_affected",
  "unknown",
]);

export const RepositoryExposureEvidenceSchema = z
  .object({
    repository: z.string().optional(),
    commitSha: z.string().optional(),
    pullRequestNumber: z.number().int().positive().optional(),
    packageName: z.string().min(1),
    ecosystem: z.string().min(1),
    installedVersion: z.string().nullable(),
    vulnerableRange: z.string().nullable(),
    firstPatchedVersion: z.string().nullable(),
    cveId: z.string().min(1),
    severity: SeveritySchema.nullable(),
    cvssScore: z.number().min(0).max(10).nullable(),
    manifestPath: z.string().nullable(),
    scope: DependencyScopeSchema,
    relationship: DependencyRelationshipSchema,
    exposureState: RepositoryExposureStateSchema,
    source: z.string().min(1),
  })
  .strict();

export const TelegraphCveEvidenceSchema = z
  .object({
    cveId: z.string().nullable(),
    severity: SeveritySchema.nullable(),
    cvssScore: z.number().min(0).max(10).nullable(),
    description: z.string().nullable(),
    references: z.array(z.string()),
    affectedVersions: z.array(z.string()).nullable(),
    fixedVersions: z.array(z.string()).nullable(),
    fixAvailable: z.boolean().nullable(),
    intent: z.literal("CVE_LOOKUP"),
    minerId: z.string().nullable(),
    minerName: z.string().nullable(),
    timestamp: z.string().nullable(),
    reasoning: z.string().nullable(),
    endpoint: z.string().nullable(),
    costUsd: z.number().min(0).nullable(),
    durationMs: z.number().int().min(0).nullable(),
    network: z.string().nullable(),
    paymentScheme: z.string().nullable(),
    requestedAt: z.string().min(1).nullable(),
    receivedAt: z.string().nullable(),
    raw: z.unknown(),
  })
  .strict();

const TelegraphFailureCodeSchema = z.enum([
  "TELEGRAPH_CHALLENGE_ERROR",
  "TELEGRAPH_PAYMENT_ERROR",
  "TELEGRAPH_ENGINE_ERROR",
  "TELEGRAPH_ROUTING_ERROR",
  "TELEGRAPH_RESPONSE_ERROR",
  "TELEGRAPH_NORMALIZATION_ERROR",
  "UNEXPECTED_NETWORK",
  "UNKNOWN_ERROR",
]);

export const TelegraphEvidenceInputSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      evidence: TelegraphCveEvidenceSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      code: TelegraphFailureCodeSchema,
    })
    .strict(),
]);

const BlockingSeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

const UniqueArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique.",
  });

export const LimenPolicySchema = z
  .object({
    version: z.string().trim().min(1).max(64),
    blockedSeverities: UniqueArray(BlockingSeveritySchema).min(1).max(4),
    dependencyScopes: UniqueArray(z.enum(["runtime", "development"]))
      .min(1)
      .max(2),
    missingExternalEvidence: z.literal("review"),
    severityConflict: z.literal("review"),
    cveIdentityConflict: z.literal("review"),
    telegraphFailure: z.literal("review"),
    unknownExposure: z.literal("review"),
  })
  .strict();

export const LimenReasonCodeSchema = z.enum([
  "AFFECTED_BLOCKING_DEPENDENCY",
  "NO_BLOCKING_CONDITION",
  "TELEGRAPH_UNAVAILABLE",
  "EXTERNAL_EVIDENCE_INCOMPLETE",
  "CVE_IDENTITY_CONFLICT",
  "SEVERITY_CONFLICT",
  "SEVERITY_UNKNOWN",
  "EXPOSURE_UNKNOWN",
  "DEPENDENCY_SCOPE_UNKNOWN",
]);

export const DecisionCheckSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    outcome: z.enum(["pass", "fail", "unknown"]),
    evidence: z.string().optional(),
  })
  .strict();

export const LimenDecisionResultSchema = z
  .object({
    id: z.string().min(1),
    decision: z.enum(["PASS", "HOLD", "REVIEW"]),
    reasonCode: LimenReasonCodeSchema,
    summary: z.string().min(1),
    cveId: z.string().min(1),
    repositoryEvidence: RepositoryExposureEvidenceSchema,
    telegraphEvidence: TelegraphCveEvidenceSchema.nullable(),
    checks: z.array(DecisionCheckSchema),
    evaluatedAt: z.string().min(1).nullable(),
    policyVersion: z.string().min(1),
  })
  .strict();
