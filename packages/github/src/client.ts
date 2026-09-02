import { z } from "zod";
import {
  GitHubAdvisoryNotFoundError,
  GitHubApiError,
  GitHubAuthError,
  GitHubConfigurationError,
  GitHubDependencySnapshotWarningError,
  GitHubPermissionError,
  GitHubRateLimitError,
  GitHubResponseError,
} from "./errors";
import {
  DependencyReviewResponseSchema,
  DependabotAlertsResponseSchema,
  GlobalAdvisorySchema,
} from "./schemas";
import type {
  CompareDependenciesInput,
  GetGlobalAdvisoryInput,
  GitHubApiResult,
  GitHubConfig,
  GitHubDependencyReviewResponseDto,
  GitHubGlobalAdvisoryDto,
  GitHubClient,
  GitHubResponseMetadata,
  ListDependabotAlertsInput,
  GitHubDependabotAlertDto,
} from "./types";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const ABBREVIATED_SHA_PATTERN = /^[0-9a-f]{7,39}$/i;

export interface GitHubClientOptions {
  config: GitHubConfig;
  fetch?: typeof fetch;
}

function requiredValue(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new GitHubConfigurationError(`GitHub ${field} is required.`, {
      field,
    });
  }
  return normalized;
}

function normalizeRevision(
  value: string,
  field: "base" | "head",
  revisionType?: "sha" | "ref",
): string {
  const revision = requiredValue(value, field);
  if (revisionType === "sha") {
    if (!FULL_SHA_PATTERN.test(revision)) {
      throw new GitHubConfigurationError(
        `GitHub ${field} must be a full 40-character commit SHA.`,
        { field },
      );
    }
    return revision.toLowerCase();
  }

  if (revisionType === "ref") {
    return revision;
  }

  if (FULL_SHA_PATTERN.test(revision)) {
    return revision.toLowerCase();
  }
  if (ABBREVIATED_SHA_PATTERN.test(revision)) {
    throw new GitHubConfigurationError(
      `GitHub ${field} cannot be an abbreviated commit SHA; provide a full SHA or mark it as a ref.`,
      { field },
    );
  }
  return revision;
}

function normalizeGhsaId(value: string): string {
  const ghsaId = requiredValue(value, "GHSA id").toUpperCase();
  if (!/^GHSA-[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(ghsaId)) {
    throw new GitHubConfigurationError("GitHub GHSA id is invalid.", {
      field: "ghsaId",
    });
  }
  return ghsaId;
}

function safeInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function responseMetadata(response: Response): GitHubResponseMetadata {
  return {
    status: response.status,
    rateLimit: {
      remaining: safeInteger(response.headers.get("x-ratelimit-remaining")),
      reset: safeInteger(response.headers.get("x-ratelimit-reset")),
    },
    requestId: response.headers.get("x-github-request-id"),
  };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function bodyType(body: unknown): string {
  if (body === null) {
    return "null";
  }
  if (Array.isArray(body)) {
    return "array";
  }
  return typeof body;
}

function errorDetails(
  metadata: GitHubResponseMetadata,
): Record<string, unknown> {
  return {
    status: metadata.status,
    rateLimit: metadata.rateLimit,
    requestId: metadata.requestId,
  };
}

export class GitHubClientImpl implements GitHubClient {
  private readonly config: GitHubConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions) {
    this.config = {
      ...options.config,
      apiUrl: options.config.apiUrl.replace(/\/$/, ""),
    };
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    operation: string,
    advisoryNotFound = false,
  ): Promise<GitHubApiResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
        method: "GET",
        headers: {
          accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": this.config.apiVersion,
          ...(this.config.token
            ? { Authorization: `Bearer ${this.config.token}` }
            : {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new GitHubApiError("The GitHub API request failed.", {
        operation,
        reason: error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "network_error",
      });
    } finally {
      clearTimeout(timeout);
    }

    const metadata = responseMetadata(response);
    const body = await readBody(response);
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 401) {
        throw new GitHubAuthError("GitHub rejected the supplied credentials.", {
          ...errorDetails(metadata),
          operation,
        });
      }
      if (
        response.status === 429 ||
        (response.status === 403 && metadata.rateLimit.remaining === 0)
      ) {
        throw new GitHubRateLimitError("GitHub API rate limit was reached.", {
          ...errorDetails(metadata),
          operation,
        });
      }
      if (response.status === 403) {
        throw new GitHubPermissionError(
          "GitHub denied access to the requested resource.",
          { ...errorDetails(metadata), operation },
        );
      }
      if (response.status === 404 && advisoryNotFound) {
        throw new GitHubAdvisoryNotFoundError(
          "GitHub could not find the requested global advisory.",
          { ...errorDetails(metadata), operation },
        );
      }
      throw new GitHubApiError("GitHub returned an unsuccessful API response.", {
        ...errorDetails(metadata),
        operation,
        bodyType: bodyType(body),
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new GitHubResponseError(
        "GitHub returned a response with an unexpected shape.",
        {
          ...errorDetails(metadata),
          operation,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
      );
    }

    return { data: parsed.data, metadata };
  }

  async compareDependencies(
    input: CompareDependenciesInput,
  ): Promise<GitHubApiResult<GitHubDependencyReviewResponseDto>> {
    const owner = encodeURIComponent(requiredValue(input.owner, "owner"));
    const repo = encodeURIComponent(requiredValue(input.repo, "repo"));
    const base = normalizeRevision(input.base, "base", input.baseRevisionType);
    const head = normalizeRevision(input.head, "head", input.headRevisionType);
    const result = await this.request(
      `/repos/${owner}/${repo}/dependency-graph/compare/${encodeURIComponent(`${base}...${head}`)}`,
      DependencyReviewResponseSchema,
      "dependency_review",
    );

    const parsed = Array.isArray(result.data)
      ? { changes: result.data, warnings: [] }
      : {
          changes: result.data.changes,
          warnings: [
            ...result.data.warnings,
            ...result.data.snapshot_warnings,
          ],
        };

    if (parsed.warnings.length > 0) {
      throw new GitHubDependencySnapshotWarningError(
        "GitHub returned a dependency snapshot warning; the dependency diff is not authoritative.",
        {
          warnings: parsed.warnings,
          metadata: result.metadata,
        },
      );
    }

    return {
      data: parsed,
      metadata: result.metadata,
    };
  }

  async getGlobalAdvisory(
    input: GetGlobalAdvisoryInput,
  ): Promise<GitHubApiResult<GitHubGlobalAdvisoryDto>> {
    const ghsaId = encodeURIComponent(normalizeGhsaId(input.ghsaId));
    return this.request(
      `/advisories/${ghsaId}`,
      GlobalAdvisorySchema,
      "global_advisory",
      true,
    );
  }

  async listDependabotAlerts(
    input: ListDependabotAlertsInput,
  ): Promise<GitHubApiResult<GitHubDependabotAlertDto[]>> {
    const owner = encodeURIComponent(requiredValue(input.owner, "owner"));
    const repo = encodeURIComponent(requiredValue(input.repo, "repo"));
    return this.request(
      `/repos/${owner}/${repo}/dependabot/alerts?per_page=100`,
      DependabotAlertsResponseSchema,
      "dependabot_alerts",
    );
  }
}

export function createGitHubClient(
  config: GitHubConfig,
  options: Omit<GitHubClientOptions, "config"> = {},
): GitHubClient {
  return new GitHubClientImpl({ ...options, config });
}
