import { GitHubConfigurationError } from "./errors";
import type {
  GitHubEvidenceCandidate,
  GitHubEvidenceContext,
  GitHubEvidenceNormalizationResult,
} from "./types";
import type {
  RepositoryExposureEvidence,
} from "../../core/src";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export function normalizeCveId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return /^CVE-\d{4}-\d{4,}$/.test(normalized) ? normalized : null;
}

export function normalizeEcosystem(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeScope(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "runtime" || normalized === "development"
    ? normalized
    : ("unknown" as const);
}

export function normalizeRelationship(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "direct" || normalized === "transitive"
    ? normalized
    : ("unknown" as const);
}

export function normalizeEvidenceContext(
  context: GitHubEvidenceContext = {},
): GitHubEvidenceContext {
  if (context.commitSha !== undefined && !FULL_SHA_PATTERN.test(context.commitSha)) {
    throw new GitHubConfigurationError(
      "GitHub evidence commitSha must be a full 40-character commit SHA.",
      { field: "commitSha" },
    );
  }
  if (
    context.pullRequestNumber !== undefined &&
    (!Number.isInteger(context.pullRequestNumber) || context.pullRequestNumber <= 0)
  ) {
    throw new GitHubConfigurationError(
      "GitHub evidence pullRequestNumber must be a positive integer.",
      { field: "pullRequestNumber" },
    );
  }

  return {
    ...(context.repository === undefined
      ? {}
      : { repository: context.repository.trim() || undefined }),
    ...(context.commitSha === undefined
      ? {}
      : { commitSha: context.commitSha.toLowerCase() }),
    ...(context.pullRequestNumber === undefined
      ? {}
      : { pullRequestNumber: context.pullRequestNumber }),
  };
}

export function buildRepositoryEvidence(
  candidate: GitHubEvidenceCandidate,
): RepositoryExposureEvidence | null {
  if (candidate.cveId === null) {
    return null;
  }

  return {
    ...(candidate.repository === undefined
      ? {}
      : { repository: candidate.repository }),
    ...(candidate.commitSha === undefined
      ? {}
      : { commitSha: candidate.commitSha }),
    ...(candidate.pullRequestNumber === undefined
      ? {}
      : { pullRequestNumber: candidate.pullRequestNumber }),
    packageName: candidate.packageName,
    ecosystem: candidate.ecosystem,
    installedVersion: candidate.installedVersion,
    vulnerableRange: candidate.vulnerableRange,
    firstPatchedVersion: candidate.firstPatchedVersion,
    cveId: candidate.cveId,
    severity: candidate.severity,
    cvssScore: candidate.cvssScore,
    manifestPath: candidate.manifestPath,
    scope: candidate.scope,
    relationship: candidate.relationship,
    exposureState: candidate.exposureState,
    source: candidate.source,
  };
}

export function createNormalizationResult(
  candidate: GitHubEvidenceCandidate,
  status: GitHubEvidenceNormalizationResult["status"],
): GitHubEvidenceNormalizationResult {
  return {
    status,
    candidate,
    repositoryEvidence:
      status === "active" ? buildRepositoryEvidence(candidate) : null,
  };
}
