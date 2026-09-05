import { describe, expect, it } from "vitest";
import {
  GITHUB_API_VERSION,
  GitHubAdvisoryNotFoundError,
  GitHubAuthError,
  GitHubConfigurationError,
  GitHubDependencySnapshotWarningError,
  GitHubPermissionError,
  GitHubRateLimitError,
  GitHubResponseError,
  createGitHubClient,
  loadGitHubConfig,
  type GitHubConfig,
} from "../packages/github/src";
import dependencyReviewVulnerable from "./fixtures/github/dependency-review-vulnerable.json";
import dependabotRuntime from "./fixtures/github/dependabot-runtime.json";
import globalAdvisoryMatching from "./fixtures/github/global-advisory-matching.json";
import malformedResponse from "./fixtures/github/malformed-response.json";

const config: GitHubConfig = {
  apiUrl: "https://api.github.com",
  apiVersion: GITHUB_API_VERSION,
  timeoutMs: 5000,
};

function createClient(
  responses: Response[],
  configOverrides: Partial<GitHubConfig> = {},
) {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    const response = responses.shift();
    if (!response) {
      throw new Error("No response fixture available");
    }
    return response;
  };
  return {
    client: createGitHubClient({ ...config, ...configOverrides }, { fetch: fetchImpl }),
    calls,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("loadGitHubConfig", () => {
  it("loads the public API defaults without requiring a token", () => {
    expect(loadGitHubConfig({})).toEqual({
      apiUrl: "https://api.github.com",
      apiVersion: GITHUB_API_VERSION,
      timeoutMs: 30000,
    });
  });

  it("keeps an optional token in memory for authenticated requests", () => {
    expect(
      loadGitHubConfig({ GITHUB_TOKEN: "example-value" }),
    ).toMatchObject({ token: "example-value" });
  });

  it("rejects invalid configuration", () => {
    expect(() =>
      loadGitHubConfig({ GITHUB_API_URL: "not-a-url" }),
    ).toThrowError(GitHubConfigurationError);
  });
});

describe("GitHubClientImpl", () => {
  it("compares dependencies with centralized API headers and optional auth", async () => {
    const { client, calls } = createClient([
      jsonResponse(dependencyReviewVulnerable, 200, {
        "x-ratelimit-remaining": "4999",
        "x-ratelimit-reset": "1760000000",
        "x-github-request-id": "request-1",
      }),
    ]);

    const result = await client.compareDependencies({
      owner: "owner",
      repo: "repo",
      base: "base-ref",
      head: "head-ref",
    });

    expect(String(calls[0]?.input)).toBe(
      "https://api.github.com/repos/owner/repo/dependency-graph/compare/base-ref...head-ref",
    );
    expect(calls[0]?.init?.method).toBe("GET");
    expect(new Headers(calls[0]?.init?.headers).get("accept")).toBe(
      "application/vnd.github+json",
    );
    expect(new Headers(calls[0]?.init?.headers).get("X-GitHub-Api-Version")).toBe(
      GITHUB_API_VERSION,
    );
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBeNull();
    expect(result.data.changes).toHaveLength(1);
    expect(result.metadata.rateLimit).toEqual({
      remaining: 4999,
      reset: 1760000000,
    });
    expect(result.metadata.requestId).toBe("request-1");
  });

  it("sends a Bearer token only when configured", async () => {
    const { client, calls } = createClient(
      [jsonResponse(globalAdvisoryMatching)],
      { token: "example-value" },
    );

    await client.getGlobalAdvisory({ ghsaId: "ghsa-35jh-r3h4-6jhm" });

    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer example-value",
    );
  });

  it("retrieves advisories and Dependabot alerts through read-only GET endpoints", async () => {
    const { client, calls } = createClient([
      jsonResponse(globalAdvisoryMatching),
      jsonResponse([dependabotRuntime]),
    ]);

    await client.getGlobalAdvisory({ ghsaId: "GHSA-35jh-r3h4-6jhm" });
    const alerts = await client.listDependabotAlerts({
      owner: "owner",
      repo: "repo",
    });

    expect(String(calls[0]?.input)).toBe(
      "https://api.github.com/advisories/GHSA-35JH-R3H4-6JHM",
    );
    expect(String(calls[1]?.input)).toBe(
      "https://api.github.com/repos/owner/repo/dependabot/alerts?per_page=100",
    );
    expect(alerts.data).toHaveLength(1);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
  });

  it("rejects the legacy object-shaped Global Advisory fields", async () => {
    const legacyAdvisory = {
      ...globalAdvisoryMatching,
      references: [{ url: "https://example.test/advisory" }],
      vulnerabilities: globalAdvisoryMatching.vulnerabilities.map((vulnerability) => ({
        ...vulnerability,
        severity: "high",
        first_patched_version: { identifier: "4.17.21" },
      })),
    };

    await expect(
      createClient([jsonResponse(legacyAdvisory)]).client.getGlobalAdvisory({
        ghsaId: "GHSA-35jh-r3h4-6jhm",
      }),
    ).rejects.toThrowError(GitHubResponseError);
  });

  it("retrieves a policy file at an explicit ref through the Contents API", async () => {
    const { client, calls } = createClient([
      jsonResponse({
        type: "file",
        encoding: "base64",
        content: "cHJvZHVjdGlvbjoK",
        path: "configs/limen.yml",
      }),
    ]);

    const result = await client.getRepositoryFile({
      owner: "owner",
      repo: "repo",
      path: "configs/limen.yml",
      ref: "a".repeat(40),
    });

    expect(String(calls[0]?.input)).toBe(
      `https://api.github.com/repos/owner/repo/contents/configs/limen.yml?ref=${"a".repeat(40)}`,
    );
    expect(result.data.encoding).toBe("base64");
  });

  it("rejects a Contents response for a different path", async () => {
    await expect(
      createClient([
        jsonResponse({
          type: "file",
          encoding: "base64",
          content: "cHJvZHVjdGlvbjoK",
          path: "other/limen.yml",
        }),
      ]).client.getRepositoryFile({
        owner: "owner",
        repo: "repo",
        path: "limen.yml",
        ref: "a".repeat(40),
      }),
    ).rejects.toMatchObject({
      code: "GITHUB_RESPONSE_ERROR",
      details: {
        expectedPath: "limen.yml",
        actualPath: "other/limen.yml",
      },
    });
  });

  it("times out while reading a response body", async () => {
    const response = {
      status: 200,
      headers: new Headers(),
      text: () => new Promise<string>(() => undefined),
    } as unknown as Response;
    const { client, calls } = createClient([response], { timeoutMs: 10 });

    await expect(client.compareDependencies({
      owner: "owner",
      repo: "repo",
      base: "base-ref",
      head: "head-ref",
    })).rejects.toMatchObject({
      code: "GITHUB_API_ERROR",
      details: { operation: "dependency_review", reason: "timeout" },
    });
    expect((calls[0]?.init?.signal as AbortSignal).aborted).toBe(true);
  });

  it("accepts full SHAs, explicit refs, and rejects ambiguous abbreviated SHAs", async () => {
    const fullBase = "A".repeat(40);
    const fullHead = "B".repeat(40);
    const first = createClient([jsonResponse([])]);
    await first.client.compareDependencies({
      owner: "owner",
      repo: "repo",
      base: fullBase,
      head: fullHead,
      baseRevisionType: "sha",
      headRevisionType: "sha",
    });
    expect(String(first.calls[0]?.input)).toContain(
      `${fullBase.toLowerCase()}...${fullHead.toLowerCase()}`,
    );

    const second = createClient([jsonResponse([])]);
    await second.client.compareDependencies({
      owner: "owner",
      repo: "repo",
      base: "abcdef1",
      head: "feature/next",
      baseRevisionType: "ref",
    });
    expect(String(second.calls[0]?.input)).toContain("abcdef1...feature%2Fnext");

    await expect(
      createClient([jsonResponse([])]).client.compareDependencies({
        owner: "owner",
        repo: "repo",
        base: "abcdef1",
        head: "head-ref",
      }),
    ).rejects.toThrowError(GitHubConfigurationError);
  });

  it.each([
    [401, {}, GitHubAuthError],
    [403, {}, GitHubPermissionError],
    [403, { "x-ratelimit-remaining": "0" }, GitHubRateLimitError],
    [429, {}, GitHubRateLimitError],
  ])("classifies HTTP %s safely", async (status, headers, ErrorType) => {
    await expect(
      createClient([jsonResponse({ message: "denied" }, status, headers)]).client
        .compareDependencies({
          owner: "owner",
          repo: "repo",
          base: "base-ref",
          head: "head-ref",
        }),
    ).rejects.toThrowError(ErrorType);
  });

  it("classifies a missing advisory distinctly", async () => {
    await expect(
      createClient([jsonResponse({ message: "Not Found" }, 404)]).client
        .getGlobalAdvisory({ ghsaId: "GHSA-35jh-r3h4-6jhm" }),
    ).rejects.toThrowError(GitHubAdvisoryNotFoundError);
  });

  it("rejects malformed API responses with a typed response error", async () => {
    await expect(
      createClient([jsonResponse(malformedResponse)]).client.compareDependencies({
        owner: "owner",
        repo: "repo",
        base: "base-ref",
        head: "head-ref",
      }),
    ).rejects.toThrowError(GitHubResponseError);

    await expect(
      createClient([jsonResponse(malformedResponse)]).client.getGlobalAdvisory({
        ghsaId: "GHSA-35jh-r3h4-6jhm",
      }),
    ).rejects.toThrowError(GitHubResponseError);

    await expect(
      createClient([jsonResponse(malformedResponse)]).client.listDependabotAlerts({
        owner: "owner",
        repo: "repo",
      }),
    ).rejects.toThrowError(GitHubResponseError);
  });

  it("does not return an apparently clean diff when snapshot warnings are present", async () => {
    await expect(
      createClient([
        jsonResponse({
          changes: [],
          warnings: [{
            code: "SNAPSHOT_STALE",
            message: "The dependency snapshot is stale.",
          }],
        }),
      ]).client.compareDependencies({
        owner: "owner",
        repo: "repo",
        base: "base-ref",
        head: "head-ref",
      }),
    ).rejects.toThrowError(GitHubDependencySnapshotWarningError);
  });

  it("does not include configured tokens in serialized API errors", async () => {
    const token = "example-secret-value";
    try {
      await createClient(
        [jsonResponse({ token }, 500)],
        { token },
      ).client.compareDependencies({
        owner: "owner",
        repo: "repo",
        base: "base-ref",
        head: "head-ref",
      });
      throw new Error("Expected GitHub API request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(JSON.stringify(error)).not.toContain(token);
    }
  });
});
