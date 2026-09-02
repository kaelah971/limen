import type {
  DependencyRelationship,
  DependencyScope,
  RepositoryExposureEvidence,
  RepositoryExposureState,
  Severity,
} from "../../core/src";

export type GitHubEvidenceSource =
  | "github-dependency-review"
  | "github-dependency-review+global-advisory"
  | "github-dependabot-alert";

export interface GitHubConfig {
  apiUrl: string;
  apiVersion: string;
  token?: string;
  timeoutMs: number;
}

export interface GitHubRateLimitMetadata {
  remaining: number | null;
  reset: number | null;
}

export interface GitHubResponseMetadata {
  status: number;
  rateLimit: GitHubRateLimitMetadata;
  requestId: string | null;
}

export interface GitHubApiResult<T> {
  data: T;
  metadata: GitHubResponseMetadata;
}

export interface CompareDependenciesInput {
  owner: string;
  repo: string;
  base: string;
  head: string;
  baseRevisionType?: "sha" | "ref";
  headRevisionType?: "sha" | "ref";
}

export interface GetGlobalAdvisoryInput {
  ghsaId: string;
}

export interface ListDependabotAlertsInput {
  owner: string;
  repo: string;
}

export interface GetRepositoryFileInput {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

export interface GitHubDependencyReviewVulnerabilityDto {
  severity: string;
  advisory_ghsa_id: string | null;
  advisory_summary: string | null;
  advisory_url: string | null;
}

export interface GitHubDependencyReviewChangeDto {
  change_type: string;
  manifest: string;
  ecosystem: string;
  name: string;
  version: string | null;
  package_url: string | null;
  license: string | null;
  source_repository_url: string | null;
  scope?: string | null;
  relationship?: string | null;
  vulnerabilities: GitHubDependencyReviewVulnerabilityDto[];
}

export interface GitHubDependencySnapshotWarning {
  code: string;
  message: string;
}

export interface GitHubDependencyReviewResponseDto {
  changes: GitHubDependencyReviewChangeDto[];
  warnings: GitHubDependencySnapshotWarning[];
}

export interface GitHubRepositoryFileDto {
  type: "file";
  encoding: "base64";
  content: string;
  path: string;
}

export interface GitHubDependencyVulnerability {
  severity: Severity;
  advisoryGhsaId: string | null;
  advisorySummary: string | null;
  advisoryUrl: string | null;
}

export interface GitHubDependencyChange {
  changeType: "added" | "removed" | "changed" | "unknown";
  manifestPath: string | null;
  ecosystem: string;
  packageName: string;
  version: string | null;
  scope: DependencyScope;
  relationship: DependencyRelationship;
  vulnerabilities: GitHubDependencyVulnerability[];
}

export interface GitHubAdvisoryVulnerabilityDto {
  package: {
    ecosystem: string;
    name: string | null;
  } | null;
  vulnerable_version_range: string | null;
  first_patched_version: string | null;
  vulnerable_functions: string[] | null;
}

export interface GitHubDependabotVulnerabilityDto {
  package: {
    ecosystem: string;
    name: string;
  };
  severity: string;
  vulnerable_version_range: string;
  first_patched_version: {
    identifier: string;
  } | null;
}

export interface GitHubCvssDto {
  score: number | null;
  vector_string?: string | null;
}

export interface GitHubCvssSeveritiesDto {
  cvss_v3?: GitHubCvssDto | null;
  cvss_v4?: GitHubCvssDto | null;
}

export interface GitHubGlobalAdvisoryDto {
  ghsa_id: string;
  cve_id: string | null;
  summary: string;
  description: string | null;
  severity: string;
  identifiers: { type: string; value: string }[] | null;
  references: string[] | null;
  vulnerabilities: GitHubAdvisoryVulnerabilityDto[] | null;
  cvss?: GitHubCvssDto | null;
  cvss_severities?: GitHubCvssSeveritiesDto | null;
}

export interface GitHubAdvisoryVulnerability {
  ecosystem: string;
  packageName: string;
  severity: Severity;
  vulnerableVersionRange: string | null;
  firstPatchedVersion: string | null;
}

export interface GitHubGlobalAdvisory {
  ghsaId: string;
  cveId: string | null;
  summary: string;
  description: string | null;
  severity: Severity;
  references: string[];
  vulnerabilities: GitHubAdvisoryVulnerability[];
  cvssScore: number | null;
}

export interface GitHubDependabotAlertDto {
  number: number;
  state: "auto_dismissed" | "dismissed" | "fixed" | "open";
  dependency: {
    package: {
      ecosystem: string;
      name: string;
    };
    manifest_path: string | null;
    scope: string | null;
    relationship: string | null;
  };
  security_advisory: GitHubGlobalAdvisoryDto;
  security_vulnerability: GitHubDependabotVulnerabilityDto;
}

export interface GitHubEvidenceContext {
  repository?: string;
  commitSha?: string;
  pullRequestNumber?: number;
}

export interface GitHubEvidenceCandidate {
  repository?: string;
  commitSha?: string;
  pullRequestNumber?: number;
  packageName: string;
  ecosystem: string;
  installedVersion: string | null;
  vulnerableRange: string | null;
  firstPatchedVersion: string | null;
  cveId: string | null;
  ghsaId: string | null;
  severity: Severity | null;
  cvssScore: number | null;
  manifestPath: string | null;
  scope: DependencyScope;
  relationship: DependencyRelationship;
  exposureState: RepositoryExposureState;
  source: GitHubEvidenceSource;
}

export type GitHubEvidenceNormalizationStatus =
  | "active"
  | "inactive"
  | "missing-cve";

export interface GitHubEvidenceNormalizationResult {
  status: GitHubEvidenceNormalizationStatus;
  candidate: GitHubEvidenceCandidate;
  repositoryEvidence: RepositoryExposureEvidence | null;
}

export interface NormalizeDependencyReviewInput {
  change: GitHubDependencyChange;
  context?: GitHubEvidenceContext;
  advisory?: GitHubGlobalAdvisory | null;
}

export interface GitHubClient {
  compareDependencies(
    input: CompareDependenciesInput,
  ): Promise<GitHubApiResult<GitHubDependencyReviewResponseDto>>;
  getGlobalAdvisory(
    input: GetGlobalAdvisoryInput,
  ): Promise<GitHubApiResult<GitHubGlobalAdvisoryDto>>;
  listDependabotAlerts(
    input: ListDependabotAlertsInput,
  ): Promise<GitHubApiResult<GitHubDependabotAlertDto[]>>;
  getRepositoryFile(
    input: GetRepositoryFileInput,
  ): Promise<GitHubApiResult<GitHubRepositoryFileDto>>;
}
