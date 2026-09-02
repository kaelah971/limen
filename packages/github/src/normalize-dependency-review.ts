import {
  normalizeSeverity,
  type Severity,
} from "../../core/src";
import { GitHubDependencySnapshotWarningError, GitHubEvidenceConflictError } from "./errors";
import {
  createNormalizationResult,
  normalizeEcosystem,
  normalizeEvidenceContext,
  normalizeRelationship,
  normalizeScope,
  normalizeCveId,
} from "./evidence";
import type {
  GitHubDependencyChange,
  GitHubDependencyReviewChangeDto,
  GitHubDependencyReviewResponseDto,
  GitHubEvidenceCandidate,
  GitHubEvidenceNormalizationResult,
  GitHubGlobalAdvisory,
  NormalizeDependencyReviewInput,
} from "./types";

function knownSeverity(value: Severity | null): value is Exclude<Severity, "UNKNOWN"> {
  return value !== null && value !== "UNKNOWN";
}

function normalizeChangeType(value: string): GitHubDependencyChange["changeType"] {
  const normalized = value.trim().toLowerCase();
  return normalized === "added" || normalized === "removed" || normalized === "changed"
    ? normalized
    : "unknown";
}

export function normalizeDependencyReviewChange(
  dto: GitHubDependencyReviewChangeDto,
): GitHubDependencyChange {
  return {
    changeType: normalizeChangeType(dto.change_type),
    manifestPath: dto.manifest.trim() || null,
    ecosystem: normalizeEcosystem(dto.ecosystem),
    packageName: dto.name.trim(),
    version: dto.version?.trim() || null,
    scope: normalizeScope(dto.scope),
    relationship: normalizeRelationship(dto.relationship),
    vulnerabilities: dto.vulnerabilities.map((vulnerability) => ({
      severity: normalizeSeverity(vulnerability.severity),
      advisoryGhsaId: vulnerability.advisory_ghsa_id?.trim().toUpperCase() || null,
      advisorySummary: vulnerability.advisory_summary?.trim() || null,
      advisoryUrl: vulnerability.advisory_url?.trim() || null,
    })),
  };
}

export function normalizeDependencyReviewResponse(
  response: GitHubDependencyReviewResponseDto,
): GitHubDependencyChange[] {
  if (response.warnings.length > 0) {
    throw new GitHubDependencySnapshotWarningError(
      "GitHub returned a dependency snapshot warning; the dependency diff is not authoritative.",
      { warnings: response.warnings },
    );
  }
  return response.changes.map(normalizeDependencyReviewChange);
}

function matchingAdvisoryVulnerabilities(
  change: GitHubDependencyChange,
  advisory: GitHubGlobalAdvisory,
) {
  return advisory.vulnerabilities.filter(
    (vulnerability) =>
      vulnerability.ecosystem === change.ecosystem &&
      vulnerability.packageName === change.packageName,
  );
}

function resolveSeverity(
  dependencySeverity: Severity,
  advisory: GitHubGlobalAdvisory | null,
  change: GitHubDependencyChange,
): Severity | null {
  const advisorySeverity = advisory?.severity ?? null;
  if (
    knownSeverity(dependencySeverity) &&
    knownSeverity(advisorySeverity) &&
    dependencySeverity !== advisorySeverity
  ) {
    throw new GitHubEvidenceConflictError(
      "GitHub Dependency Review and Global Advisory severity values conflict.",
      {
        packageName: change.packageName,
        ecosystem: change.ecosystem,
        dependencyReviewSeverity: dependencySeverity,
        advisorySeverity,
      },
    );
  }
  return advisorySeverity ?? dependencySeverity;
}

function candidateForChange(
  input: NormalizeDependencyReviewInput,
  vulnerability: GitHubDependencyChange["vulnerabilities"][number],
): GitHubEvidenceCandidate {
  const change = input.change;
  const advisory = input.advisory ?? null;
  if (
    advisory !== null &&
    vulnerability.advisoryGhsaId !== null &&
    advisory.ghsaId !== vulnerability.advisoryGhsaId
  ) {
    throw new GitHubEvidenceConflictError(
      "The Global Advisory does not match the Dependency Review GHSA.",
      {
        packageName: change.packageName,
        ecosystem: change.ecosystem,
        dependencyReviewGhsaId: vulnerability.advisoryGhsaId,
        advisoryGhsaId: advisory.ghsaId,
      },
    );
  }

  const matching = advisory === null
    ? []
    : matchingAdvisoryVulnerabilities(change, advisory);
  const exactMetadata = matching.length === 1 ? matching[0] : null;
  return {
    ...normalizeEvidenceContext(input.context),
    packageName: change.packageName,
    ecosystem: change.ecosystem,
    installedVersion: change.version,
    vulnerableRange: exactMetadata?.vulnerableVersionRange ?? null,
    firstPatchedVersion: exactMetadata?.firstPatchedVersion ?? null,
    cveId: normalizeCveId(advisory?.cveId),
    ghsaId: vulnerability.advisoryGhsaId ?? advisory?.ghsaId ?? null,
    severity: resolveSeverity(vulnerability.severity, advisory, change),
    cvssScore: advisory?.cvssScore ?? null,
    manifestPath: change.manifestPath,
    scope: change.scope,
    relationship: change.relationship,
    exposureState: "affected",
    source:
      advisory === null
        ? "github-dependency-review"
        : "github-dependency-review+global-advisory",
  };
}

export function normalizeDependencyReviewEvidence(
  input: NormalizeDependencyReviewInput,
): GitHubEvidenceNormalizationResult[] {
  if (
    input.change.changeType === "removed" ||
    input.change.vulnerabilities.length === 0
  ) {
    return [];
  }

  if (input.change.changeType !== "added" && input.change.changeType !== "changed") {
    return input.change.vulnerabilities.map((vulnerability) =>
      createNormalizationResult(
        candidateForChange(input, vulnerability),
        "inactive",
      ),
    );
  }

  return input.change.vulnerabilities.map((vulnerability) => {
    const candidate = candidateForChange(input, vulnerability);
    return createNormalizationResult(
      candidate,
      candidate.cveId === null ? "missing-cve" : "active",
    );
  });
}
