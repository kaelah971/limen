import { LimenError, redactString } from "../../core/src";

export class GitHubError extends LimenError {
  constructor(
    code:
      | "GITHUB_CONFIGURATION_ERROR"
      | "GITHUB_API_ERROR"
      | "GITHUB_AUTH_ERROR"
      | "GITHUB_PERMISSION_ERROR"
      | "GITHUB_RATE_LIMIT_ERROR"
      | "GITHUB_RESPONSE_ERROR"
      | "GITHUB_ADVISORY_NOT_FOUND"
      | "GITHUB_EVIDENCE_CONFLICT"
      | "GITHUB_DEPENDENCY_SNAPSHOT_WARNING",
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, redactString(message), details);
  }
}

export class GitHubConfigurationError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_CONFIGURATION_ERROR", message, details);
  }
}

export class GitHubApiError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_API_ERROR", message, details);
  }
}

export class GitHubAuthError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_AUTH_ERROR", message, details);
  }
}

export class GitHubPermissionError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_PERMISSION_ERROR", message, details);
  }
}

export class GitHubRateLimitError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_RATE_LIMIT_ERROR", message, details);
  }
}

export class GitHubResponseError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_RESPONSE_ERROR", message, details);
  }
}

export class GitHubAdvisoryNotFoundError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_ADVISORY_NOT_FOUND", message, details);
  }
}

export class GitHubEvidenceConflictError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_EVIDENCE_CONFLICT", message, details);
  }
}

export class GitHubDependencySnapshotWarningError extends GitHubError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("GITHUB_DEPENDENCY_SNAPSHOT_WARNING", message, details);
  }
}
