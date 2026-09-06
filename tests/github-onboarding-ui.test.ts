import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  createLimenApi,
  getInstallationId,
  integrationRecoveryGuidance,
  LimenApiError,
  type IntegrationErrorCode,
  normalizeLimenApiBaseUrl,
} from "../app/lib/limen-api";
import {
  bindInstallationAndLoadRepositories,
} from "../app/install/install-client";
import {
  getGitHubAppInstallUrl,
} from "../app/install/install-config";
import {
  REPOSITORY_LIFECYCLE_STATES,
  repositoryLifecycleLabel,
} from "../app/components/repository-status";
import type { LimenApi } from "../app/lib/limen-api";

const ACCESS_TOKEN = "supabase-access-token";

const REPOSITORY = {
  repositoryId: 301,
  owner: "kaelah971",
  name: "limen",
  fullName: "kaelah971/limen",
  defaultBranch: "main",
  lifecycleState: "SETUP_REQUIRED" as const,
  latestDecision: null,
  latestEvaluationAt: null,
  setupPullRequest: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHub App public configuration", () => {
  it("derives the installation URL from a trimmed valid slug", () => {
    expect(getGitHubAppInstallUrl(" release-gate-app ")).toBe(
      "https://github.com/apps/release-gate-app/installations/new",
    );
  });

  it.each([
    undefined,
    "",
    "   ",
    "Release-Gate-App",
    "release_gate_app",
    "release/gate",
    "release?gate",
    "release#gate",
    "release:gate",
    "release gate",
    "release-gate\napp",
  ])("rejects invalid GitHub App slug %s without exposing configuration", (slug) => {
    expect(() => getGitHubAppInstallUrl(slug)).toThrow(
      "The GitHub App installation is not configured.",
    );
  });
});

describe("Limen API client", () => {
  it("normalizes the configured API base and allows local HTTP only outside production", () => {
    expect(normalizeLimenApiBaseUrl(" https://api.example.test/// ", "production")).toBe(
      "https://api.example.test",
    );
    expect(normalizeLimenApiBaseUrl("http://127.0.0.1:8787/", "development")).toBe(
      "http://127.0.0.1:8787",
    );
    expect(() => normalizeLimenApiBaseUrl("http://api.example.test", "production")).toThrow(
      "The Limen API is not configured safely.",
    );
    expect(() => normalizeLimenApiBaseUrl("https://user:password@api.example.test", "production"))
      .toThrow("The Limen API is not configured safely.");
  });

  it("binds with the Supabase bearer token and then fetches authorized repositories", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { bound: true, installationId: 201 }))
      .mockResolvedValueOnce(jsonResponse(200, { repositories: [REPOSITORY] }));
    const api = createLimenApi("https://api.example.test", fetcher);

    const repositories = await bindInstallationAndLoadRepositories("201", ACCESS_TOKEN, api);

    expect(repositories).toEqual([REPOSITORY]);
    expect(fetcher.mock.calls.map(([url, init]) => ({
      url,
      method: init?.method,
      authorization: new Headers(init?.headers).get("authorization"),
    }))).toEqual([
      {
        url: "https://api.example.test/v1/github/installations/201/bind",
        method: "POST",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      {
        url: "https://api.example.test/v1/github/repositories",
        method: "GET",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    ]);
  });

  it("rejects an invalid installation ID before making a request", async () => {
    const api = {
      bindInstallation: vi.fn(),
      listRepositories: vi.fn(),
    } as unknown as LimenApi;

    await expect(bindInstallationAndLoadRepositories("0", ACCESS_TOKEN, api)).rejects.toMatchObject({
      code: "GITHUB_INSTALLATION_ID_INVALID",
    });
    expect(api.bindInstallation).not.toHaveBeenCalled();
    expect(api.listRepositories).not.toHaveBeenCalled();
    expect(getInstallationId("9007199254740992")).toBeNull();
  });

  it("keeps backend error details out of typed client errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(500, {
        code: "SUPABASE_SERVICE_ROLE_KEY leaked",
        message: "private-key-that-must-not-escape",
      }),
    );
    const api = createLimenApi("https://api.example.test", fetcher);

    const error = await api.listRepositories(ACCESS_TOKEN).catch((caught) => caught);

    expect(error).toBeInstanceOf(LimenApiError);
    expect(String(error)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(String(error)).not.toContain("private-key-that-must-not-escape");
    expect(error).toMatchObject({ status: 500 });
  });

  it.each([
    ["INSTALLATION_NOT_CONFIRMED", 409],
    ["INSTALLATION_DISCONNECTED", 409],
    ["SETUP_FILES_CONFLICT", 409],
    ["SETUP_PR_FAILED", 500],
    ["OIDC_REJECTED", 401],
    ["CALLBACK_REPOSITORY_MISMATCH", 403],
    ["CONFIGURATION_INVALID", 409],
  ] as const)("preserves the stable integration code %s without raw backend details", async (code, status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(status, {
        code,
        message: "private-key-that-must-not-escape",
      }),
    );
    const api = createLimenApi("https://api.example.test", fetcher);

    const error = await api.listRepositories(ACCESS_TOKEN).catch((caught) => caught);

    expect(error).toBeInstanceOf(LimenApiError);
    expect(error).toMatchObject({ status, code, integrationCode: code });
    expect(String(error)).not.toContain("private-key-that-must-not-escape");
  });

  it.each([
    ["INSTALLATION_NOT_CONFIRMED", "GitHub is still confirming this installation. Try again shortly."],
    ["INSTALLATION_DISCONNECTED", "Reinstall or reconnect the Limen GitHub App."],
    ["SETUP_FILES_CONFLICT", "Inspect the existing Limen workflow and policy files before creating setup."],
    ["SETUP_PR_FAILED", "Retry setup PR creation after checking repository permissions."],
    ["OIDC_REJECTED", "Inspect the Limen workflow and GitHub OIDC configuration."],
    ["CALLBACK_REPOSITORY_MISMATCH", "Inspect the repository installation and workflow configuration."],
    ["CONFIGURATION_INVALID", "Review the Limen workflow, repository Secret, Variable, and setup policy."],
  ] as const)("maps %s to safe recovery guidance", (code, message) => {
    expect(integrationRecoveryGuidance(code as IntegrationErrorCode)).toBe(message);
  });

  it("uses GET for read endpoints and POST for setup PR creation", async () => {
    const preview = {
      repositoryId: 301,
      files: [
        { path: "limen.yml", status: "missing", content: "production:\n" },
        { path: ".github/workflows/limen.yml", status: "existing" },
      ],
      filesToCreate: ["limen.yml"],
      alreadyConfigured: false,
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, REPOSITORY))
      .mockResolvedValueOnce(jsonResponse(200, preview))
      .mockResolvedValueOnce(jsonResponse(200, {
        repositoryId: 301,
        code: "SETUP_PR_CREATED",
        setupPullRequest: {
          number: 42,
          url: "https://github.com/kaelah971/limen/pull/42",
          state: "OPEN",
        },
      }));
    const api = createLimenApi("https://api.example.test", fetcher);

    await expect(api.getRepository(301, ACCESS_TOKEN)).resolves.toEqual(REPOSITORY);
    await expect(api.getSetupPreview(301, ACCESS_TOKEN)).resolves.toEqual(preview);
    await expect(api.createSetupPullRequest(301, ACCESS_TOKEN)).resolves.toMatchObject({
      code: "SETUP_PR_CREATED",
    });
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "GET", "POST"]);
  });
});

describe("GitHub onboarding UI contracts", () => {
  it("defines lifecycle states independently from release decisions", () => {
    expect(REPOSITORY_LIFECYCLE_STATES).toEqual([
      "SETUP_REQUIRED",
      "SETUP_PR_OPEN",
      "CONFIGURED",
      "VERIFIED",
      "NEEDS_ATTENTION",
      "DISCONNECTED",
    ]);
    expect(REPOSITORY_LIFECYCLE_STATES).not.toContain("REVIEW");
    expect(repositoryLifecycleLabel("SETUP_REQUIRED")).toBe("Setup required");
    expect(repositoryLifecycleLabel("SETUP_PR_OPEN")).toBe("Setup PR open");
    expect(repositoryLifecycleLabel("CONFIGURED")).toBe("Configured");
    expect(repositoryLifecycleLabel("VERIFIED")).toBe("Verified");
    expect(repositoryLifecycleLabel("NEEDS_ATTENTION")).toBe("Needs attention");
    expect(repositoryLifecycleLabel("DISCONNECTED")).toBe("Disconnected");
  });

  it("documents auth-first install, safe binding, repository state, and setup behavior", async () => {
    const [installPage, installConfig, installClient, repositoriesPage, repositoryCard, repositoryStatus, detailClient] = await Promise.all([
      readFile("app/install/page.tsx", "utf8"),
      readFile("app/install/install-config.ts", "utf8"),
      readFile("app/install/install-client.tsx", "utf8"),
      readFile("app/repositories/page.tsx", "utf8"),
      readFile("app/components/repository-card.tsx", "utf8"),
      readFile("app/components/repository-status.tsx", "utf8"),
      readFile("app/repositories/[repositoryId]/repository-client.tsx", "utf8"),
    ]);
    const source = [installPage, installConfig, installClient, repositoriesPage, repositoryCard, repositoryStatus, detailClient].join("\n");

    expect(source).toContain("Continue with GitHub");
    expect(source).toContain("Install Limen GitHub App");
    expect(installConfig).toContain("NEXT_PUBLIC_GITHUB_APP_SLUG");
    expect(installConfig).toContain("https://github.com/apps/${slug}/installations/new");
    expect(installClient).toContain("createClient");
    expect(installClient).toContain("getSession");
    expect(installClient).toContain("signInWithOAuth");
    expect(installClient).toContain("Confirming your GitHub installation");
    expect(installClient).toContain("replaceState");
    expect(installClient).toContain("bindInstallationAndLoadRepositories");
    expect(repositoriesPage).toContain("listRepositories");
    expect(repositoryCard).toContain("Configure Limen");
    expect(repositoryCard).toContain("View setup PR");
    expect(repositoryCard).toContain("Fix setup");
    expect(detailClient).toContain("getSetupPreview");
    expect(detailClient).toContain("createSetupPullRequest");
    expect(detailClient).toContain("Create setup PR");
    expect(detailClient).toContain("LIMEN_TELEGRAPH_PRIVATE_KEY");
    expect(detailClient).toContain("TELEGRAPH_ENGINE_URL");
    expect(detailClient).toContain("Limen's repository integration needs attention before it can reliably report future evaluations.");
    expect(detailClient).toContain("Review the repository setup and GitHub configuration.");
    expect(detailClient).toContain("Setup is merged. Limen is waiting for the first accepted real evaluation before this repository becomes Verified.");
    expect(detailClient).toContain("Verified after at least one accepted OIDC-authenticated evaluation.");
    expect(detailClient).toContain("Needs evidence review");
    expect(source).not.toContain("localStorage");
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|GITHUB_APP_PRIVATE_KEY|GITHUB_WEBHOOK_SECRET|TELEGRAPH_PRIVATE_KEY\s*=/);
    expect(repositoryStatus).not.toContain('"REVIEW"');
  });
});
