export {
  assertGitHubApiUrl,
  GITHUB_API_URL,
  GITHUB_API_VERSION,
  loadGitHubConfig,
} from "./config";

export {
  GitHubClientImpl,
  createGitHubClient,
  type GitHubClientOptions,
} from "./client";

export {
  GitHubAdvisoryNotFoundError,
  GitHubApiError,
  GitHubAuthError,
  GitHubConfigurationError,
  GitHubDependencySnapshotWarningError,
  GitHubError,
  GitHubEvidenceConflictError,
  GitHubPermissionError,
  GitHubRateLimitError,
  GitHubResponseError,
} from "./errors";

export {
  normalizeCveId,
  normalizeEcosystem,
  normalizeEvidenceContext,
  normalizeRelationship,
  normalizeScope,
  buildRepositoryEvidence,
  createNormalizationResult,
} from "./evidence";

export {
  normalizeGlobalAdvisory,
} from "./normalize-advisory";

export {
  normalizeDependencyReviewChange,
  normalizeDependencyReviewEvidence,
  normalizeDependencyReviewResponse,
} from "./normalize-dependency-review";

export { normalizeDependabotAlert } from "./normalize-dependabot";

export {
  DependencyReviewChangeSchema,
  DependencyReviewResponseSchema,
  DependabotAlertSchema,
  DependabotAlertsResponseSchema,
  GlobalAdvisorySchema,
  RepositoryFileSchema,
} from "./schemas";

export type {
  CompareDependenciesInput,
  GetRepositoryFileInput,
  GetGlobalAdvisoryInput,
  GitHubAdvisoryVulnerability,
  GitHubAdvisoryVulnerabilityDto,
  GitHubApiResult,
  GitHubClient,
  GitHubConfig,
  GitHubCvssDto,
  GitHubCvssSeveritiesDto,
  GitHubDependencyChange,
  GitHubDependencyReviewChangeDto,
  GitHubDependencyReviewResponseDto,
  GitHubDependencyReviewVulnerabilityDto,
  GitHubDependencySnapshotWarning,
  GitHubDependencyVulnerability,
  GitHubDependabotAlertDto,
  GitHubDependabotVulnerabilityDto,
  GitHubEvidenceCandidate,
  GitHubEvidenceContext,
  GitHubEvidenceNormalizationResult,
  GitHubEvidenceSource,
  GitHubGlobalAdvisory,
  GitHubGlobalAdvisoryDto,
  GitHubRateLimitMetadata,
  GitHubResponseMetadata,
  GitHubRepositoryFileDto,
  ListDependabotAlertsInput,
  NormalizeDependencyReviewInput,
} from "./types";
