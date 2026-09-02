import { ConfigurationError } from "../errors/errors";
import {
  LimenPolicySchema,
  RepositoryExposureEvidenceSchema,
  TelegraphEvidenceInputSchema,
} from "../schemas/domain";
import type {
  DecisionCheck,
  DecisionCheckOutcome,
  LimenDecision,
  LimenDecisionInput,
  LimenDecisionResult,
  LimenPolicy,
  LimenReasonCode,
  RepositoryExposureEvidence,
  Severity,
  TelegraphEvidenceInput,
} from "../domain/types";

function isKnownSeverity(
  severity: Severity | null,
): severity is Exclude<Severity, "UNKNOWN"> {
  return severity !== null && severity !== "UNKNOWN";
}

function normalizeCveId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^CVE-\d{4}-\d{4,}$/.test(normalized) ? normalized : null;
}

function check(
  id: string,
  label: string,
  outcome: DecisionCheckOutcome,
  evidence?: string,
): DecisionCheck {
  return {
    id,
    label,
    outcome,
    ...(evidence === undefined ? {} : { evidence }),
  };
}

function validationError(
  message: string,
  issues: readonly { path: PropertyKey[]; message: string }[],
): ConfigurationError {
  return new ConfigurationError(message, {
    issues: issues.map((issue) => ({ path: issue.path, message: issue.message })),
  });
}

export function validateLimenPolicy(policy: unknown): LimenPolicy {
  const parsed = LimenPolicySchema.safeParse(policy);
  if (!parsed.success) {
    throw validationError("Limen policy is invalid.", parsed.error.issues);
  }
  return parsed.data;
}

function validateEvaluationInput(input: LimenDecisionInput): {
  repositoryEvidence: RepositoryExposureEvidence;
  telegraphEvidence: TelegraphEvidenceInput;
  policy: LimenPolicy;
} {
  if (input.id.trim() === "" || input.evaluatedAt.trim() === "") {
    throw new ConfigurationError(
      "A decision id and evaluation timestamp are required.",
    );
  }

  const repository = RepositoryExposureEvidenceSchema.safeParse(
    input.repositoryEvidence,
  );
  if (!repository.success) {
    throw validationError(
      "Repository exposure evidence is invalid.",
      repository.error.issues,
    );
  }

  const telegraph = TelegraphEvidenceInputSchema.safeParse(
    input.telegraphEvidence,
  );
  if (!telegraph.success) {
    throw new ConfigurationError("Telegraph evidence input is invalid.", {
      issues: telegraph.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }

  return {
    repositoryEvidence: repository.data,
    telegraphEvidence: telegraph.data,
    policy: validateLimenPolicy(input.policy),
  };
}

function buildChecks(
  repository: RepositoryExposureEvidence,
  telegraphInput: TelegraphEvidenceInput,
  policy: LimenPolicy,
): DecisionCheck[] {
  const telegraph =
    telegraphInput.status === "available" ? telegraphInput.evidence : null;
  const repositoryCveId = normalizeCveId(repository.cveId);
  const telegraphCveId = telegraph?.cveId
    ? normalizeCveId(telegraph.cveId)
    : null;
  const hasIdentityConflict =
    telegraph !== null &&
    telegraph.cveId !== null &&
    (repositoryCveId === null ||
      telegraphCveId === null ||
      repositoryCveId !== telegraphCveId);
  const hasSeverityConflict =
    telegraph !== null &&
    isKnownSeverity(repository.severity) &&
    isKnownSeverity(telegraph.severity) &&
    repository.severity !== telegraph.severity;
  const telegraphSeverity = telegraph?.severity ?? null;
  const effectiveSeverity = isKnownSeverity(repository.severity)
    ? repository.severity
    : isKnownSeverity(telegraphSeverity)
      ? telegraphSeverity
      : null;
  const blockingSeverity =
    effectiveSeverity !== null &&
    policy.blockedSeverities.includes(effectiveSeverity);

  return [
    check(
      "telegraph-availability",
      "Telegraph evidence availability",
      telegraphInput.status === "available" ? "pass" : "fail",
      telegraphInput.status === "failed"
        ? `Failure code: ${telegraphInput.code}`
        : "Paid routed evidence received.",
    ),
    check(
      "cve-identity",
      "CVE identity agreement",
      telegraph === null || telegraph.cveId === null
        ? "unknown"
        : hasIdentityConflict
          ? "fail"
          : "pass",
      telegraph === null
        ? "No Telegraph identity is available."
        : telegraph.cveId === null
          ? "Telegraph did not provide a CVE identity."
          : hasIdentityConflict
            ? "Repository and Telegraph CVE identities do not agree."
            : `Both sources identify ${telegraphCveId}.`,
    ),
    check(
      "severity-consistency",
      "Severity consistency",
      telegraph === null ||
        repository.severity === "UNKNOWN" ||
        telegraph.severity === null ||
        telegraph.severity === "UNKNOWN"
        ? "unknown"
        : hasSeverityConflict
          ? "fail"
          : "pass",
      telegraph === null || telegraph.severity === null
        ? "No Telegraph severity is available."
        : telegraph.severity === "UNKNOWN"
          ? "Telegraph severity is unknown."
          : hasSeverityConflict
            ? `Repository severity is ${repository.severity}; Telegraph severity is ${telegraph.severity}.`
            : "Known severity values agree or only one source supplied a value.",
    ),
    check(
      "repository-exposure",
      "Repository exposure state",
      repository.exposureState === "unknown"
        ? "unknown"
        : repository.exposureState === "affected"
          ? "fail"
          : "pass",
      `Repository exposure is ${repository.exposureState}.`,
    ),
    check(
      "dependency-scope",
      "Dependency scope policy",
      repository.scope === "unknown"
        ? "unknown"
        : policy.dependencyScopes.includes(
              repository.scope as "runtime" | "development",
            )
          ? "fail"
          : "pass",
      repository.scope === "unknown"
        ? "Dependency scope is unknown."
        : policy.dependencyScopes.includes(
              repository.scope as "runtime" | "development",
            )
          ? `${repository.scope} is in the blocked policy scope.`
          : `${repository.scope} is outside the blocked policy scope.`,
    ),
    check(
      "blocking-severity",
      "Blocking severity policy",
      effectiveSeverity === null
        ? "unknown"
        : blockingSeverity
          ? "fail"
          : "pass",
      effectiveSeverity === null
        ? "No known severity is available."
        : blockingSeverity
          ? `${effectiveSeverity} is blocked by policy.`
          : `${effectiveSeverity} is not blocked by policy.`,
    ),
  ];
}

function createResult(
  input: LimenDecisionInput,
  repositoryEvidence: RepositoryExposureEvidence,
  telegraphInput: TelegraphEvidenceInput,
  policy: LimenPolicy,
  checks: DecisionCheck[],
  decision: LimenDecision,
  reasonCode: LimenReasonCode,
  summary: string,
): LimenDecisionResult {
  return {
    id: input.id,
    decision,
    reasonCode,
    summary,
    cveId: repositoryEvidence.cveId,
    repositoryEvidence,
    telegraphEvidence:
      telegraphInput.status === "available" ? telegraphInput.evidence : null,
    checks,
    evaluatedAt: input.evaluatedAt,
    policyVersion: policy.version,
  };
}

export function evaluateLimenDecision(
  input: LimenDecisionInput,
): LimenDecisionResult {
  const validated = validateEvaluationInput(input);
  const { repositoryEvidence, telegraphEvidence, policy } = validated;
  const checks = buildChecks(repositoryEvidence, telegraphEvidence, policy);

  if (telegraphEvidence.status === "failed") {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "REVIEW",
      "TELEGRAPH_UNAVAILABLE",
      "Telegraph evidence was unavailable; human review is required.",
    );
  }

  const telegraph = telegraphEvidence.evidence;

  if (telegraph.cveId === null || telegraph.severity === null) {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "REVIEW",
      "EXTERNAL_EVIDENCE_INCOMPLETE",
      "Required external evidence is incomplete; human review is required.",
    );
  }

  if (
    repositoryEvidence.severity === "UNKNOWN" ||
    telegraph.severity === "UNKNOWN"
  ) {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "REVIEW",
      "SEVERITY_UNKNOWN",
      "Severity could not be normalized confidently; human review is required.",
    );
  }

  const repositoryCveId = normalizeCveId(repositoryEvidence.cveId);
  const telegraphCveId = normalizeCveId(telegraph.cveId);
  if (repositoryCveId === null || telegraphCveId === null || repositoryCveId !== telegraphCveId) {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "REVIEW",
      "CVE_IDENTITY_CONFLICT",
      "Repository and Telegraph CVE identities conflict; human review is required.",
    );
  }

  if (
    isKnownSeverity(repositoryEvidence.severity) &&
    repositoryEvidence.severity !== telegraph.severity
  ) {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "REVIEW",
      "SEVERITY_CONFLICT",
      "Repository and Telegraph severity values conflict; human review is required.",
    );
  }

  if (repositoryEvidence.exposureState === "unknown") {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "REVIEW",
      "EXPOSURE_UNKNOWN",
      "Repository exposure is unknown; human review is required.",
    );
  }

  const scopeMatches =
    repositoryEvidence.scope !== "unknown" &&
    policy.dependencyScopes.includes(repositoryEvidence.scope);
  if (repositoryEvidence.exposureState === "affected" && !scopeMatches) {
    if (repositoryEvidence.scope === "unknown") {
      return createResult(
        input,
        repositoryEvidence,
        telegraphEvidence,
        policy,
        checks,
        "REVIEW",
        "DEPENDENCY_SCOPE_UNKNOWN",
        "Dependency scope is unknown for an affected dependency; human review is required.",
      );
    }

    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "PASS",
      "NO_BLOCKING_CONDITION",
      "The affected dependency is outside the policy's blocked scopes.",
    );
  }

  const effectiveSeverity = isKnownSeverity(repositoryEvidence.severity)
    ? repositoryEvidence.severity
    : telegraph.severity;
  const blockingSeverity = policy.blockedSeverities.includes(effectiveSeverity);
  if (repositoryEvidence.exposureState === "affected" && blockingSeverity) {
    return createResult(
      input,
      repositoryEvidence,
      telegraphEvidence,
      policy,
      checks,
      "HOLD",
      "AFFECTED_BLOCKING_DEPENDENCY",
      "An affected dependency matches the policy's blocked scope and severity.",
    );
  }

  return createResult(
    input,
    repositoryEvidence,
    telegraphEvidence,
    policy,
    checks,
    "PASS",
    "NO_BLOCKING_CONDITION",
    "Repository evidence does not meet a blocking policy condition.",
  );
}
