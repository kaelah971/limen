import { z } from "zod";
import {
  assertGitHubApiUrl,
} from "./config";
import {
  GitHubAdvisoryNotFoundError,
  GitHubApiError,
  GitHubAuthError,
  GitHubConfigurationError,
  GitHubDependencySnapshotWarningError,
  GitHubError,
  GitHubPermissionError,
  GitHubRateLimitError,
  GitHubResponseError,
} from "./errors";
import {
  DependencyReviewResponseSchema,
  DependabotAlertsResponseSchema,
  GlobalAdvisorySchema,
  RepositoryFileSchema,
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
  GetRepositoryFileInput,
  GitHubRepositoryFileDto,
} from "./types";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const ABBREVIATED_SHA_PATTERN = /^[0-9a-f]{7,39}$/i;
const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;

function assertResponseBodySize(response: Response, operation: string): void {
  const contentLength = response.headers.get("content-length");
  if (contentLength === null) {
    return;
  }

  const parsedLength = Number(contentLength);
  if (!Number.isFinite(parsedLength) || parsedLength > MAX_RESPONSE_BODY_BYTES) {
    throw new GitHubApiError("The GitHub API response body is too large.", {
      operation,
      reason: "response_too_large",
    });
  }
}

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

function encodeRepositoryPath(value: string): string {
  const path = requiredValue(value, "path");
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
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

async function readBody(
  response: Response,
  timeoutMs: number,
  operation: string,
  onTimeout?: () => void,
): Promise<unknown> {
  assertResponseBodySize(response, operation);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const text = await Promise.race([
    response.text(),
    new Promise<string>((_, reject) => {
      timeout = setTimeout(() => {
        onTimeout?.();
        reject(new GitHubApiError(
          "The GitHub API response body timed out.",
          { operation, reason: "timeout" },
        ));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  });
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BODY_BYTES) {
    throw new GitHubApiError("The GitHub API response body is too large.", {
      operation,
      reason: "response_too_large",
    });
  }
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
    assertGitHubApiUrl(options.config.apiUrl);
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
    try {
      const response = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": this.config.apiVersion,
          ...(this.config.token
            ? { Authorization: `Bearer ${this.config.token}` }
            : {}),
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        throw new GitHubApiError(
          "The GitHub API request timed out.",
          { operation, reason: "timeout" },
        );
      }
      const metadata = responseMetadata(response);
      const body = await readBody(
        response,
        this.config.timeoutMs,
        operation,
        () => controller.abort(),
      );
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
    } catch (error) {
      if (error instanceof GitHubError) {
        throw error;
      }
      throw new GitHubApiError("The GitHub API request failed.", {
        operation,
        reason: controller.signal.aborted ? "timeout" : "network_error",
      });
    } finally {
      clearTimeout(timeout);
    }
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

  async getRepositoryFile(
    input: GetRepositoryFileInput,
  ): Promise<GitHubApiResult<GitHubRepositoryFileDto>> {
    const owner = encodeURIComponent(requiredValue(input.owner, "owner"));
    const repo = encodeURIComponent(requiredValue(input.repo, "repo"));
    const requestedPath = requiredValue(input.path, "path");
    const path = encodeRepositoryPath(requestedPath);
    const ref = encodeURIComponent(requiredValue(input.ref, "ref"));
    const result = await this.request(
      `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
      RepositoryFileSchema,
      "repository_file",
    );
    if (result.data.path !== requestedPath) {
      throw new GitHubResponseError(
        "GitHub returned a different repository file than requested.",
        {
          operation: "repository_file",
          expectedPath: requestedPath,
          actualPath: result.data.path,
        },
      );
    }
    return result;
  }
}

export function createGitHubClient(
  config: GitHubConfig,
  options: Omit<GitHubClientOptions, "config"> = {},
): GitHubClient {
  return new GitHubClientImpl({ ...options, config });
}
