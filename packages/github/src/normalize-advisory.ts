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

function validCvssScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10
    ? value
    : null;
}

function advisoryCveId(dto: GitHubGlobalAdvisoryDto): string | null {
  const candidates = [
    normalizeCveId(dto.cve_id),
    ...(dto.identifiers ?? [])
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
  severity: Severity,
): GitHubAdvisoryVulnerability[] {
  return (dto.vulnerabilities ?? []).flatMap((vulnerability) => {
    const packageName = vulnerability.package?.name?.trim() ?? "";
    if (packageName === "") {
      return [];
    }

    return [{
      ecosystem: normalizeEcosystem(vulnerability.package?.ecosystem ?? ""),
      packageName,
      severity,
      vulnerableVersionRange:
        vulnerability.vulnerable_version_range?.trim() || null,
      firstPatchedVersion:
        vulnerability.first_patched_version?.trim() || null,
    }];
  });
}

export function normalizeGlobalAdvisory(
  dto: GitHubGlobalAdvisoryDto,
): GitHubGlobalAdvisory {
  const severity = normalizeSeverity(dto.severity);
  const advisory: GitHubGlobalAdvisory = {
    ghsaId: dto.ghsa_id.trim().toUpperCase(),
    cveId: advisoryCveId(dto),
    summary: dto.summary,
    description: dto.description,
    severity,
    references: (dto.references ?? [])
      .map((reference) => reference.trim())
      .filter((reference) => reference.length > 0),
    vulnerabilities: advisoryVulnerabilities(dto, severity),
    cvssScore: advisoryCvssScore(dto),
  };
  return advisory;
}
