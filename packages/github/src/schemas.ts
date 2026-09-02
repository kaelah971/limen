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

const AdvisoryPackageSchema = z
  .object({
    ecosystem: z.string(),
    name: z.string(),
  })
  .passthrough();

const AdvisoryVulnerabilitySchema = z
  .object({
    package: AdvisoryPackageSchema,
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
    description: z.string(),
    severity: z.string().nullable(),
    identifiers: z.array(z.object({ type: z.string(), value: z.string() })),
    references: z.array(z.object({ url: z.string() })),
    vulnerabilities: z.array(AdvisoryVulnerabilitySchema),
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
        package: AdvisoryPackageSchema,
        manifest_path: z.string().nullable(),
        scope: z.string().nullable(),
        relationship: z.string().nullable(),
      })
      .passthrough(),
    security_advisory: GlobalAdvisorySchema,
    security_vulnerability: AdvisoryVulnerabilitySchema,
  })
  .passthrough();

export const DependabotAlertsResponseSchema = z.array(DependabotAlertSchema);
