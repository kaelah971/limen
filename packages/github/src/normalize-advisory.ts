import {
  normalizeSeverity,
  type Severity,
} from "../../core/src";
import { GitHubEvidenceConflictError } from "./errors";
import { normalizeCveId, normalizeEcosystem } from "./evidence";
import type {
  GitHubAdvisoryVulnerability,
  GitHubGlobalAdvisory,
  GitHubGlobalAdvisoryDto,
} from "./types";

function knownSeverity(value: Severity | null): value is Exclude<Severity, "UNKNOWN"> {
  return value !== null && value !== "UNKNOWN";
}

function validCvssScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10
    ? value
    : null;
}

function advisoryCveId(dto: GitHubGlobalAdvisoryDto): string | null {
  const candidates = [
    normalizeCveId(dto.cve_id),
    ...dto.identifiers
      .filter((identifier) => identifier.type.trim().toUpperCase() === "CVE")
      .map((identifier) => normalizeCveId(identifier.value)),
  ].filter((value): value is string => value !== null);
  const unique = [...new Set(candidates)];

  if (unique.length > 1) {
    throw new GitHubEvidenceConflictError(
      "GitHub global advisory contains conflicting CVE identities.",
      { ghsaId: dto.ghsa_id },
    );
  }
  return unique[0] ?? null;
}

function advisoryCvssScore(dto: GitHubGlobalAdvisoryDto): number | null {
  return (
    validCvssScore(dto.cvss?.score) ??
    validCvssScore(dto.cvss_severities?.cvss_v3?.score) ??
    validCvssScore(dto.cvss_severities?.cvss_v4?.score)
  );
}

function advisoryVulnerabilities(
  dto: GitHubGlobalAdvisoryDto,
): GitHubAdvisoryVulnerability[] {
  return dto.vulnerabilities.map((vulnerability) => ({
    ecosystem: normalizeEcosystem(vulnerability.package.ecosystem),
    packageName: vulnerability.package.name.trim(),
    severity: normalizeSeverity(vulnerability.severity),
    vulnerableVersionRange:
      vulnerability.vulnerable_version_range.trim() || null,
    firstPatchedVersion:
      vulnerability.first_patched_version?.identifier.trim() || null,
  }));
}

function assertAdvisorySeverityConsistency(
  advisory: GitHubGlobalAdvisory,
): void {
  const knownSeverities = [
    advisory.severity,
    ...advisory.vulnerabilities.map((vulnerability) => vulnerability.severity),
  ].filter(knownSeverity);
  if (new Set(knownSeverities).size > 1) {
    throw new GitHubEvidenceConflictError(
      "GitHub global advisory contains conflicting severity values.",
      { ghsaId: advisory.ghsaId },
    );
  }
}

export function normalizeGlobalAdvisory(
  dto: GitHubGlobalAdvisoryDto,
): GitHubGlobalAdvisory {
  const advisory: GitHubGlobalAdvisory = {
    ghsaId: dto.ghsa_id.trim().toUpperCase(),
    cveId: advisoryCveId(dto),
    summary: dto.summary,
    description: dto.description,
    severity:
      dto.severity === null ? null : normalizeSeverity(dto.severity),
    references: dto.references
      .map((reference) => reference.url.trim())
      .filter((reference) => reference.length > 0),
    vulnerabilities: advisoryVulnerabilities(dto),
    cvssScore: advisoryCvssScore(dto),
  };
  assertAdvisorySeverityConsistency(advisory);
  return advisory;
}
