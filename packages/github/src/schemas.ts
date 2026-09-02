import { z } from "zod";

const DependencyReviewVulnerabilitySchema = z
  .object({
    severity: z.string(),
    advisory_ghsa_id: z.string().nullable(),
    advisory_summary: z.string().nullable(),
    advisory_url: z.string().nullable(),
  })
  .passthrough();

export const DependencyReviewChangeSchema = z
  .object({
    change_type: z.string(),
    manifest: z.string(),
    ecosystem: z.string(),
    name: z.string(),
    version: z.string().nullable(),
    package_url: z.string().nullable(),
    license: z.string().nullable(),
    source_repository_url: z.string().nullable(),
    scope: z.string().nullable().optional(),
    relationship: z.string().nullable().optional(),
    vulnerabilities: z.array(DependencyReviewVulnerabilitySchema),
  })
  .passthrough();

const SnapshotWarningSchema = z
  .object({
    code: z.string().min(1).default("GITHUB_DEPENDENCY_SNAPSHOT_WARNING"),
    message: z.string().min(1),
  })
  .passthrough();

const DependencyReviewEnvelopeSchema = z
  .object({
    changes: z.array(DependencyReviewChangeSchema),
    warnings: z.array(SnapshotWarningSchema).optional().default([]),
    snapshot_warnings: z.array(SnapshotWarningSchema).optional().default([]),
  })
  .passthrough();

export const DependencyReviewResponseSchema = z.union([
  z.array(DependencyReviewChangeSchema),
  DependencyReviewEnvelopeSchema,
]);

const DependabotPackageSchema = z
  .object({
    ecosystem: z.string(),
    name: z.string(),
  })
  .passthrough();

const GlobalAdvisoryPackageSchema = z
  .object({
    ecosystem: z.string(),
    name: z.string().nullable(),
  })
  .passthrough();

const GlobalAdvisoryVulnerabilitySchema = z
  .object({
    package: GlobalAdvisoryPackageSchema.nullable(),
    vulnerable_version_range: z.string().nullable(),
    first_patched_version: z.string().nullable(),
    vulnerable_functions: z.array(z.string()).nullable(),
  })
  .passthrough();

const DependabotVulnerabilitySchema = z
  .object({
    package: DependabotPackageSchema,
    severity: z.string(),
    vulnerable_version_range: z.string(),
    first_patched_version: z
      .object({ identifier: z.string() })
      .passthrough()
      .nullable(),
  })
  .passthrough();

const CvssSchema = z
  .object({
    score: z.number().nullable(),
    vector_string: z.string().nullable().optional(),
  })
  .passthrough();

const CvssSeveritiesSchema = z
  .object({
    cvss_v3: CvssSchema.nullable().optional(),
    cvss_v4: CvssSchema.nullable().optional(),
  })
  .passthrough();

export const GlobalAdvisorySchema = z
  .object({
    ghsa_id: z.string().min(1),
    cve_id: z.string().nullable(),
    summary: z.string(),
    description: z.string().nullable(),
    severity: z.string(),
    identifiers: z
      .array(z.object({ type: z.string(), value: z.string() }))
      .nullable(),
    references: z.array(z.string()).nullable(),
    vulnerabilities: z.array(GlobalAdvisoryVulnerabilitySchema).nullable(),
    cvss: CvssSchema.nullable().optional(),
    cvss_severities: CvssSeveritiesSchema.nullable().optional(),
  })
  .passthrough();

export const DependabotAlertSchema = z
  .object({
    number: z.number().int().positive(),
    state: z.enum(["auto_dismissed", "dismissed", "fixed", "open"]),
    dependency: z
      .object({
        package: DependabotPackageSchema,
        manifest_path: z.string().nullable(),
        scope: z.string().nullable(),
        relationship: z.string().nullable(),
      })
      .passthrough(),
    security_advisory: GlobalAdvisorySchema,
    security_vulnerability: DependabotVulnerabilitySchema,
  })
  .passthrough();

export const DependabotAlertsResponseSchema = z.array(DependabotAlertSchema);

export const RepositoryFileSchema = z
  .object({
    type: z.literal("file"),
    encoding: z.literal("base64"),
    content: z.string(),
    path: z.string().min(1),
  })
  .passthrough();
