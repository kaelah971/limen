import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type {
  GitHubAppStore,
  GitHubInstallationAuthorizationStore,
  GitHubInstallationRecord,
  GitHubUserInput,
} from "../apps/api/src/github-app-store";
import {
  GitHubInstallationAlreadyBoundError,
  GitHubInstallationDisconnectedError,
  GitHubInstallationNotConfirmedError,
  SupabaseGitHubAppStore,
} from "../apps/api/src/github-app-store";
import {
  authenticateUser,
  type SupabaseAuthUser,
  type UserAuthClient,
} from "../apps/api/src/user-auth";
import { handleGitHubRepositoryRequest } from "../apps/api/src/github-app-routes";
import { createLedgerServer } from "../apps/api/src/server";
import {
  createGitHubInstallationClient,
  createSetupService,
  type GitHubSetupTransport,
  type SetupPullRequestRecord,
  type SetupRepository,
} from "../packages/github-app/src";
import { afterEach, describe, expect, it, vi } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260905000000_create_github_app_onboarding.sql";
const ATOMIC_SETUP_MIGRATION_PATH =
  "supabase/migrations/20260906000000_add_atomic_github_setup_pr_persistence.sql";

const TABLES = [
  "github_users",
  "github_installations",
  "github_repositories",
  "github_setup_prs",
  "github_webhook_deliveries",
  "repository_evaluations",
] as const;

describe("GitHub App metadata schema", () => {
  it("declares the metadata tables, lifecycle contract, and server-only access boundary", async () => {
    const migration = await readFile(MIGRATION_PATH, "utf8");

    for (const table of TABLES) {
      expect(migration).toMatch(
        new RegExp(`create table if not exists public\\.${table}\\b`),
      );
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }

    for (const lifecycleState of [
      "SETUP_REQUIRED",
      "SETUP_PR_OPEN",
      "CONFIGURED",
      "VERIFIED",
      "NEEDS_ATTENTION",
      "DISCONNECTED",
    ]) {
      expect(migration).toContain(lifecycleState);
    }

    for (const decision of ["PASS", "HOLD", "REVIEW"]) {
      expect(migration).toContain(decision);
    }

    expect(migration).toContain(
      "auth_user_id uuid primary key references auth.users(id) on delete cascade",
    );
    expect(migration).toContain(
      "bound_by_auth_user_id uuid null references public.github_users(auth_user_id) on delete set null",
    );
    expect(migration).toContain(
      "unique (repository_id, github_run_id, run_attempt)",
    );
    expect(migration).toContain(
      "where state = 'OPEN'",
    );
    expect(migration).toContain("delivery_id text primary key");
    expect(migration).toContain("workflow_ref text not null");
    expect(migration).toContain("commit_sha text not null");
    expect(migration).toContain(
      "revoke all on table public.github_users, public.github_installations, public.github_repositories, public.github_setup_prs, public.github_webhook_deliveries, public.repository_evaluations from anon, authenticated",
    );

    const columnNames = migration.split("\n").flatMap((line) => {
      const match = line.match(/^\s{2}([a-z][a-z0-9_]*)\s+/i);
      return match?.[1] ? [match[1]] : [];
    });

    expect(columnNames.some((name) =>
      /private_key|installation_token|telegraph_private_key/i.test(name),
    )).toBe(false);
  });

  it("has no persisted installation-token storage or disconnect cleanup path", async () => {
    const [migration, storeSource] = await Promise.all([
      readFile(MIGRATION_PATH, "utf8"),
      readFile("apps/api/src/github-app-store.ts", "utf8"),
    ]);

    expect(migration).not.toMatch(/github_installation_tokens|installation_token\s+(text|varchar|json)/i);
    expect(storeSource).not.toMatch(/delete[\s\S]{0,160}installation[\s_]?token|installation[\s_]?token[\s\S]{0,160}delete/i);
  });
});

describe("atomic setup PR persistence migration", () => {
  it("defines the URL column and service-role-only atomic persistence RPC", async () => {
    const migration = await readFile(ATOMIC_SETUP_MIGRATION_PATH, "utf8");
    const normalized = migration.toLowerCase();

    expect(normalized).toMatch(
      /alter table public\.github_setup_prs\s+add column(?: if not exists)?\s+pr_url\s+text/i,
    );
    expect(normalized).toMatch(/pr_url\s+text\s+not null|alter column pr_url set not null/i);
    expect(normalized).toMatch(
      /create or replace function public\.record_github_setup_pr_and_transition\s*\(\s*p_repository_id\s+bigint\s*,\s*p_pr_number\s+bigint\s*,\s*p_pr_url\s+text\s*,\s*p_branch_name\s+text\s*\)/i,
    );

    const functionBody = normalized.slice(
      normalized.indexOf("create or replace function public.record_github_setup_pr_and_transition"),
      normalized.indexOf("revoke execute on function public.record_github_setup_pr_and_transition"),
    );
    expect(functionBody).toContain("security definer");
    expect(functionBody).toMatch(/set search_path\s*=\s*pg_catalog\s*,\s*public/);
    expect(functionBody).toContain("for update");
    expect(functionBody).toMatch(/insert\s+into\s+public\.github_setup_prs/);
    expect(functionBody).toMatch(/update\s+public\.github_repositories/);
    expect(functionBody).toContain("lifecycle_state = 'setup_pr_open'");
    expect(functionBody).toContain("state = 'open'");
    expect(functionBody).toContain("github_setup_pr_already_open");
    expect(functionBody).toContain("github_repository_not_found");
    expect(functionBody).toContain("github_repository_disconnected");
    expect(functionBody).toContain("github_setup_input_invalid");
    expect(normalized).toContain("github_setup_prs_one_open_per_repository_idx");

    expect(normalized).toMatch(
      /revoke execute on function public\.record_github_setup_pr_and_transition\s*\(bigint, bigint, text, text\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    expect(normalized).toMatch(
      /grant execute on function public\.record_github_setup_pr_and_transition\s*\(bigint, bigint, text, text\)\s+to\s+service_role/i,
    );
    expect(normalized).not.toMatch(/(private_key|installation_token|telegraph_private_key|access_token|refresh_token|oauth_token)/i);
  });
});

describe("GitHub integration health persistence", () => {
  it("updates only lifecycle state and updated_at", async () => {
    const query = {
      update: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: { repository_id: 123456, lifecycle_state: "NEEDS_ATTENTION" },
      error: null,
    });

    const client = { from: vi.fn(() => query) };
    const store = new SupabaseGitHubAppStore(client as never);
    const observedAt = "2026-09-06T00:00:00.000Z";

    await expect(store.markRepositoryNeedsAttention({
      repositoryId: 123456,
      observedAt,
    })).resolves.toBeUndefined();

    expect(client.from).toHaveBeenCalledWith("github_repositories");
    expect(query.update).toHaveBeenCalledWith({
      lifecycle_state: "NEEDS_ATTENTION",
      updated_at: observedAt,
    });
    expect(query.eq).toHaveBeenCalledWith("repository_id", 123456);
    expect(query.in).toHaveBeenCalledWith("lifecycle_state", ["CONFIGURED", "VERIFIED", "NEEDS_ATTENTION"]);
    expect(query.update.mock.calls[0]?.[0]).not.toHaveProperty("latest_decision");
    expect(query.update.mock.calls[0]?.[0]).not.toHaveProperty("latest_evaluation_at");
  });
});

describe("GitHub disconnect and historical persistence", () => {
  it("reads bounded newest-first history for a bound disconnected installation", async () => {
    const authorizationQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    authorizationQuery.select.mockReturnValue(authorizationQuery);
    authorizationQuery.eq.mockReturnValue(authorizationQuery);
    authorizationQuery.maybeSingle.mockResolvedValue({
      data: { repository_id: 304 },
      error: null,
    });
    const historyQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    historyQuery.select.mockReturnValue(historyQuery);
    historyQuery.eq.mockReturnValue(historyQuery);
    historyQuery.order.mockReturnValue(historyQuery);
    historyQuery.limit.mockResolvedValue({
      data: [{
        github_run_id: 401,
        run_attempt: 2,
        workflow_ref: "kaelah971/limen/.github/workflows/limen.yml@refs/heads/main",
        commit_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decision: "REVIEW",
        receipt_id: "receipt-401",
        evaluated_at: "2026-09-06T02:00:00.000Z",
      }],
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => table === "github_repositories" ? authorizationQuery : historyQuery),
    };
    const store = new SupabaseGitHubAppStore(client as never);

    await expect(store.listAuthorizedRepositoryEvaluations(304, AUTH_USER_ID, 100)).resolves.toEqual([{
      githubRunId: 401,
      githubRunAttempt: 2,
      workflowRef: "kaelah971/limen/.github/workflows/limen.yml@refs/heads/main",
      commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      decision: "REVIEW",
      receiptId: "receipt-401",
      evaluatedAt: "2026-09-06T02:00:00.000Z",
    }]);
    expect(authorizationQuery.eq).toHaveBeenCalledWith(
      "github_installations.bound_by_auth_user_id",
      AUTH_USER_ID,
    );
    expect(historyQuery.order).toHaveBeenCalledWith("evaluated_at", { ascending: false });
    expect(historyQuery.limit).toHaveBeenCalledWith(100);
  });

  it("disconnects installation metadata and repositories without deleting history", async () => {
    const installationQuery = { update: vi.fn(), eq: vi.fn() };
    const repositoryQuery = { update: vi.fn(), eq: vi.fn() };
    installationQuery.update.mockReturnValue(installationQuery);
    installationQuery.eq.mockResolvedValue({ error: null });
    repositoryQuery.update.mockReturnValue(repositoryQuery);
    repositoryQuery.eq.mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => table === "github_installations" ? installationQuery : repositoryQuery),
    };
    const store = new SupabaseGitHubAppStore(client as never);

    await expect(store.disconnectInstallation(201)).resolves.toBeUndefined();

    expect(installationQuery.update).toHaveBeenCalledWith(expect.objectContaining({ connection_state: "DISCONNECTED" }));
    expect(repositoryQuery.update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle_state: "DISCONNECTED" }));
    expect(client.from).not.toHaveBeenCalledWith("repository_evaluations");
  });

  it("scopes repository removal to the installation and supplied IDs", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), in: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => query) };
    const store = new SupabaseGitHubAppStore(client as never);

    await expect(store.removeInstallationRepositories(201, [301, 302])).resolves.toBeUndefined();

    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ lifecycle_state: "DISCONNECTED" }));
    expect(query.eq).toHaveBeenCalledWith("installation_id", 201);
    expect(query.in).toHaveBeenCalledWith("repository_id", [301, 302]);
  });

  it("starts added repositories at SETUP_REQUIRED", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const store = new SupabaseGitHubAppStore(client as never);

    await expect(store.addInstallationRepositories(201, [{
      repositoryId: 301,
      ownerLogin: "kaelah971",
      repositoryName: "limen",
      fullName: "kaelah971/limen",
      defaultBranch: "main",
    }])).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({
      repository_id: 301,
      installation_id: 201,
      lifecycle_state: "SETUP_REQUIRED",
    })], { onConflict: "repository_id" });
  });
});

describe("Supabase SSR authentication", () => {
  it("uses only lazy public Supabase credentials and fixed callback destinations", async () => {
    const [serverHelper, browserHelper, callback] = await Promise.all([
      readFile("app/lib/supabase/server.ts", "utf8"),
      readFile("app/lib/supabase/browser.ts", "utf8"),
      readFile("app/auth/callback/route.ts", "utf8"),
    ]);
    const source = `${serverHelper}\n${browserHelper}\n${callback}`;

    expect(serverHelper).toContain("createServerClient");
    expect(browserHelper).toContain("createBrowserClient");
    expect(source).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(callback).toContain("exchangeCodeForSession(code)");
    expect(callback).toContain('new URL("/install", request.url)');
    expect(callback).toContain('url.searchParams.set("auth", "failed")');
    expect(callback).not.toContain("redirectTo");
  });

  it("redirects a missing OAuth code without exposing credentials", async () => {
    const { GET } = await import("../app/auth/callback/route");
    const response = await GET(new Request("https://limen.example/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://limen.example/install?auth=failed",
    );
  });

  it("exchanges an OAuth code and redirects to the fixed install page", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({ error: null }));
    vi.resetModules();
    vi.doMock("../app/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { exchangeCodeForSession } }),
    }));

    try {
      const { GET } = await import("../app/auth/callback/route");
      const response = await GET(new Request(
        "https://limen.example/auth/callback?code=pkce-code&next=https%3A%2F%2Fevil.example",
      ));

      expect(exchangeCodeForSession).toHaveBeenCalledOnce();
      expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://limen.example/install");
    } finally {
      vi.doUnmock("../app/lib/supabase/server");
      vi.resetModules();
    }
  });

  it("redirects a failed OAuth exchange to the sanitized failure path", async () => {
    const exchangeCodeForSession = vi.fn(async () => ({
      error: { message: "invalid code" },
    }));
    vi.resetModules();
    vi.doMock("../app/lib/supabase/server", () => ({
      createClient: async () => ({ auth: { exchangeCodeForSession } }),
    }));

    try {
      const { GET } = await import("../app/auth/callback/route");
      const response = await GET(new Request(
        "https://limen.example/auth/callback?code=expired-code",
      ));

      expect(exchangeCodeForSession).toHaveBeenCalledWith("expired-code");
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://limen.example/install?auth=failed",
      );
    } finally {
      vi.doUnmock("../app/lib/supabase/server");
      vi.resetModules();
    }
  });
});

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const GITHUB_USER_ID = 101;
const INSTALLATION_ID = 201;

function githubAuthUser(
  overrides: Partial<SupabaseAuthUser> = {},
): SupabaseAuthUser {
  return {
    id: AUTH_USER_ID,
    identities: [{
      provider: "github",
      identity_data: {
        provider_id: String(GITHUB_USER_ID),
        user_name: "installer",
      },
    }],
    ...overrides,
  };
}

function authClient(
  result: { user: SupabaseAuthUser | null; error: unknown | null },
): UserAuthClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: result.user }, error: result.error }),
    },
  };
}

class FakeAuthorizationStore implements GitHubAppStore, GitHubInstallationAuthorizationStore {
  readonly users = new Map<string, GitHubUserInput>();
  readonly installations = new Map<number, GitHubInstallationRecord>();
  bindCount = 0;

  async claimDelivery(): Promise<{ duplicate: boolean }> {
    return { duplicate: false };
  }

  async recordInstallationCreated(): Promise<void> {}
  async disconnectInstallation(): Promise<void> {}
  async addInstallationRepositories(): Promise<void> {}
  async removeInstallationRepositories(): Promise<void> {}
  async syncSetupPullRequestClosed(): Promise<void> {}

  async upsertGitHubUser(input: GitHubUserInput): Promise<void> {
    this.users.set(input.authUserId, input);
  }

  async getInstallation(installationId: number): Promise<GitHubInstallationRecord | null> {
    return this.installations.get(installationId) ?? null;
  }

  async bindInstallation(
    installationId: number,
    authUserId: string,
  ): Promise<"BOUND" | "ALREADY_BOUND"> {
    const installation = this.installations.get(installationId);
    if (installation?.boundByAuthUserId === authUserId) {
      return "ALREADY_BOUND";
    }
    if (installation === undefined) {
      throw new GitHubInstallationNotConfirmedError();
    }
    if (installation.connectionState === "DISCONNECTED") {
      throw new GitHubInstallationDisconnectedError();
    }
    if (installation.boundByAuthUserId !== null) {
      throw new GitHubInstallationAlreadyBoundError();
    }
    installation.boundByAuthUserId = authUserId;
    this.bindCount += 1;
    return "BOUND";
  }
}

const servers: ReturnType<typeof createLedgerServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function startAuthorizationServer(
  store: FakeAuthorizationStore,
  client: UserAuthClient,
): Promise<string> {
  const server = createLedgerServer({
    ledger: {
      persistRun: async () => ({ id: "LM-RUN-AUTH-TEST", created: true }),
      getRun: async () => null,
    },
    ingestToken: "ingest-secret",
    githubInstallationBind: {
      authClient: client,
      store,
    },
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function postBind(
  url: string,
  installationId: number | string = INSTALLATION_ID,
  token: string | null = "valid-token",
): Promise<Response> {
  return fetch(`${url}/v1/github/installations/${installationId}/bind`, {
    method: "POST",
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

describe("GitHub user authentication", () => {
  it("rejects a missing bearer token", async () => {
    await expect(authenticateUser(
      { headers: {} } as never,
      authClient({ user: githubAuthUser(), error: null }),
    )).rejects.toMatchObject({ status: 401, code: "GITHUB_AUTH_REQUIRED" });
  });

  it("rejects an invalid Supabase access token", async () => {
    await expect(authenticateUser(
      { headers: { authorization: "Bearer invalid-token" } } as never,
      authClient({ user: null, error: new Error("invalid token") }),
    )).rejects.toMatchObject({ status: 401, code: "GITHUB_AUTH_INVALID" });
  });

  it("rejects a malformed bearer token", async () => {
    await expect(authenticateUser(
      { headers: { authorization: "Bearer valid-token extra" } } as never,
      authClient({ user: githubAuthUser(), error: null }),
    )).rejects.toMatchObject({ status: 401, code: "GITHUB_AUTH_MALFORMED" });
  });

  it("rejects an authenticated user without a GitHub identity", async () => {
    await expect(authenticateUser(
      { headers: { authorization: "Bearer valid-token" } } as never,
      authClient({ user: githubAuthUser({ identities: [] }), error: null }),
    )).rejects.toMatchObject({ status: 403, code: "GITHUB_IDENTITY_REQUIRED" });
  });

  it("returns only verified GitHub identity metadata", async () => {
    const store = new FakeAuthorizationStore();
    await expect(authenticateUser(
      { headers: { authorization: "Bearer valid-token" } } as never,
      authClient({ user: githubAuthUser(), error: null }),
      store,
    )).resolves.toEqual({
      authUserId: AUTH_USER_ID,
      githubUserId: GITHUB_USER_ID,
      githubLogin: "installer",
    });
    expect(store.users.get(AUTH_USER_ID)).toEqual({
      authUserId: AUTH_USER_ID,
      githubUserId: GITHUB_USER_ID,
      githubLogin: "installer",
    });
  });

  it("rejects malformed verified GitHub identity data", async () => {
    await expect(authenticateUser(
      { headers: { authorization: "Bearer valid-token" } } as never,
      authClient({
        user: githubAuthUser({
          identities: [{
            provider: "github",
            identity_data: { provider_id: "not-a-number", user_name: "installer" },
          }],
        }),
        error: null,
      }),
    )).rejects.toMatchObject({ status: 403, code: "GITHUB_IDENTITY_REQUIRED" });
  });
});

describe("GitHub installation authorization", () => {
  it("rejects a missing bearer token at the bind endpoint", async () => {
    const store = new FakeAuthorizationStore();
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url, INSTALLATION_ID, null);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "GITHUB_AUTH_REQUIRED" });
  });

  it("rejects a malformed bearer token at the bind endpoint", async () => {
    const store = new FakeAuthorizationStore();
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url, INSTALLATION_ID, "valid-token extra");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "GITHUB_AUTH_MALFORMED" });
  });

  it("binds an active installation only for its webhook installer", async () => {
    const store = new FakeAuthorizationStore();
    store.installations.set(INSTALLATION_ID, {
      installationId: INSTALLATION_ID,
      installedByGithubUserId: GITHUB_USER_ID,
      boundByAuthUserId: null,
      connectionState: "ACTIVE",
    });
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      bound: true,
      installationId: INSTALLATION_ID,
    });
    expect(store.installations.get(INSTALLATION_ID)?.boundByAuthUserId).toBe(AUTH_USER_ID);
  });

  it("rejects a setup redirect for an installation owned by another GitHub user", async () => {
    const store = new FakeAuthorizationStore();
    store.installations.set(INSTALLATION_ID, {
      installationId: INSTALLATION_ID,
      installedByGithubUserId: 999,
      boundByAuthUserId: null,
      connectionState: "ACTIVE",
    });
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url);

    expect(response.status).toBe(403);
    expect(store.bindCount).toBe(0);
    await response.text();
  });

  it("rejects disconnected installations", async () => {
    const store = new FakeAuthorizationStore();
    store.installations.set(INSTALLATION_ID, {
      installationId: INSTALLATION_ID,
      installedByGithubUserId: GITHUB_USER_ID,
      boundByAuthUserId: null,
      connectionState: "DISCONNECTED",
    });
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "INSTALLATION_DISCONNECTED" });
  });

  it("rejects installation IDs absent from verified webhook state", async () => {
    const store = new FakeAuthorizationStore();
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "INSTALLATION_NOT_CONFIRMED" });
  });

  it("keeps a same-user bind idempotent", async () => {
    const store = new FakeAuthorizationStore();
    store.installations.set(INSTALLATION_ID, {
      installationId: INSTALLATION_ID,
      installedByGithubUserId: GITHUB_USER_ID,
      boundByAuthUserId: AUTH_USER_ID,
      connectionState: "ACTIVE",
    });
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ bound: true, alreadyBound: true });
    expect(store.bindCount).toBe(0);
  });

  it("does not allow a second Limen user to take an existing binding", async () => {
    const store = new FakeAuthorizationStore();
    store.installations.set(INSTALLATION_ID, {
      installationId: INSTALLATION_ID,
      installedByGithubUserId: GITHUB_USER_ID,
      boundByAuthUserId: OTHER_AUTH_USER_ID,
      connectionState: "ACTIVE",
    });
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url);

    expect(response.status).toBe(409);
    expect(store.bindCount).toBe(0);
  });

  it("rejects invalid installation IDs", async () => {
    const store = new FakeAuthorizationStore();
    const url = await startAuthorizationServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
    );

    const response = await postBind(url, "0");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "GITHUB_INSTALLATION_ID_INVALID" });
  });

  it("does not expose bearer or provider tokens in auth errors", async () => {
    const accessToken = "supabase-access-token-fixture";
    const providerToken = "github-provider-token-fixture";
    let thrown: unknown;
    try {
      await authenticateUser(
        { headers: { authorization: `Bearer ${accessToken}` } } as never,
        authClient({
          user: githubAuthUser({
            identities: [{
              provider: "github",
              identity_data: {
                provider_id: String(GITHUB_USER_ID),
                user_name: "installer",
                access_token: providerToken,
                refresh_token: "github-refresh-token-fixture",
              },
            }],
          }),
          error: new Error(`provider failure ${providerToken}`),
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).not.toContain(accessToken);
    expect(String(thrown)).not.toContain(providerToken);
  });

  it("does not expose an invalid token in a bind response", async () => {
    const accessToken = "supabase-access-token-response-fixture";
    const providerToken = "github-provider-token-response-fixture";
    const store = new FakeAuthorizationStore();
    const url = await startAuthorizationServer(
      store,
      authClient({
        user: null,
        error: new Error(`invalid ${providerToken}`),
      }),
    );

    const response = await postBind(url, INSTALLATION_ID, accessToken);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(401);
    expect(body).not.toContain(accessToken);
    expect(body).not.toContain(providerToken);
  });
});

type RepositoryLifecycleState =
  | "SETUP_REQUIRED"
  | "SETUP_PR_OPEN"
  | "CONFIGURED"
  | "VERIFIED"
  | "NEEDS_ATTENTION"
  | "DISCONNECTED";

interface RepositoryFixture {
  repositoryId: number;
  installationId: number;
  ownerLogin: string;
  repositoryName: string;
  fullName: string;
  defaultBranch: string;
  lifecycleState: RepositoryLifecycleState;
  latestDecision: "PASS" | "HOLD" | "REVIEW" | null;
  latestEvaluationAt: string | null;
  setupPullRequest: SetupPullRequestRecord | null;
}

interface HistoricalEvaluationFixture {
  githubRunId: number;
  githubRunAttempt: number;
  workflowRef: string;
  commitSha: string;
  decision: "PASS" | "HOLD" | "REVIEW";
  receiptId: string | null;
  evaluatedAt: string;
}

const SECOND_REPOSITORY_ID = 302;
const UNBOUND_REPOSITORY_ID = 303;
const DISCONNECTED_REPOSITORY_ID = 304;
const REPOSITORY_INSTALLATION_ID = 401;
const OTHER_INSTALLATION_ID = 402;
const UNBOUND_INSTALLATION_ID = 403;
const DISCONNECTED_INSTALLATION_ID = 404;
const INSTALLATION_TOKEN = "task-7-installation-token-fixture";
const SETUP_ACTION_SHA = "1111111111111111111111111111111111111111";
const SETUP_CONFIG = {
  actionSha: SETUP_ACTION_SHA,
  limenApiUrl: "https://api.example.test",
};

function githubAuthUserFor(
  authUserId: string,
  githubUserId: number,
  githubLogin: string,
): SupabaseAuthUser {
  return {
    id: authUserId,
    identities: [{
      provider: "github",
      identity_data: {
        provider_id: String(githubUserId),
        user_name: githubLogin,
      },
    }],
  };
}

function repositoryFixture(
  repositoryId: number,
  installationId: number,
  overrides: Partial<RepositoryFixture> = {},
): RepositoryFixture {
  return {
    repositoryId,
    installationId,
    ownerLogin: "kaelah971",
    repositoryName: `repo-${repositoryId}`,
    fullName: `kaelah971/repo-${repositoryId}`,
    defaultBranch: "main",
    lifecycleState: "SETUP_REQUIRED",
    latestDecision: null,
    latestEvaluationAt: null,
    setupPullRequest: null,
    ...overrides,
  };
}

class FakeRepositoryStore extends FakeAuthorizationStore {
  readonly repositories = new Map<number, RepositoryFixture>();
  readonly historicalEvaluations = new Map<number, HistoricalEvaluationFixture[]>();
  readonly historyLimits: number[] = [];
  readonly recordedSetupPullRequests: Parameters<FakeRepositoryStore["recordSetupPullRequestAndTransition"]>[0][] = [];
  recordError: Error | undefined;
  transitionCount = 0;
  mintCount = 0;

  async listAuthorizedRepositories(authUserId: string): Promise<RepositoryFixture[]> {
    return [...this.repositories.values()].filter((repository) => {
      const installation = this.installations.get(repository.installationId);
      return installation?.boundByAuthUserId === authUserId;
    });
  }

  async getAuthorizedRepository(
    repositoryId: number,
    authUserId: string,
  ): Promise<RepositoryFixture | null> {
    const repository = this.repositories.get(repositoryId);
    const installation = repository === undefined
      ? undefined
      : this.installations.get(repository.installationId);
    return installation?.boundByAuthUserId === authUserId ? repository ?? null : null;
  }

  async listAuthorizedRepositoryEvaluations(
    repositoryId: number,
    authUserId: string,
    limit: number,
  ): Promise<HistoricalEvaluationFixture[] | null> {
    this.historyLimits.push(limit);
    const repository = this.repositories.get(repositoryId);
    const installation = repository === undefined
      ? undefined
      : this.installations.get(repository.installationId);
    if (installation?.boundByAuthUserId !== authUserId) {
      return null;
    }
    return (this.historicalEvaluations.get(repositoryId) ?? []).slice(0, limit);
  }

  async getInstallationState(
    installationId: number,
  ): Promise<"ACTIVE" | "DISCONNECTED"> {
    const installation = this.installations.get(installationId);
    if (installation === undefined) {
      throw new Error("installation not found");
    }
    return installation.connectionState;
  }

  async getOpenSetupPullRequest(
    repositoryId: number,
  ): Promise<SetupPullRequestRecord | null> {
    return this.repositories.get(repositoryId)?.setupPullRequest ?? null;
  }

  async recordSetupPullRequestAndTransition(
    input: {
      repositoryId: number;
      prNumber: number;
      prUrl: string;
      branchName: string;
    },
  ): Promise<SetupPullRequestRecord> {
    this.recordedSetupPullRequests.push(input);
    if (this.recordError !== undefined) {
      throw this.recordError;
    }
    const record: SetupPullRequestRecord = { ...input, state: "OPEN" };
    const repository = this.repositories.get(input.repositoryId);
    if (repository === undefined) {
      throw new Error("repository not found");
    }
    repository.setupPullRequest = record;
    repository.lifecycleState = "SETUP_PR_OPEN";
    this.transitionCount += 1;
    return record;
  }
}

class FakeRepositoryGitHubTransport implements GitHubSetupTransport {
  readonly calls: { kind: string; token: string }[] = [];
  readonly createdFiles: { path: string; content: string; branchName: string }[] = [];
  readonly pullRequests: { title: string; body: string; head: string; base: string }[] = [];
  readonly files = new Map<string, "missing" | "present" | Error>();

  async getRepositoryFile(
    input: { owner: string; repo: string; path: string; ref: string },
    token: string,
  ) {
    this.calls.push({ kind: "getRepositoryFile", token });
    const state = this.files.get(input.path) ?? "missing";
    if (state === "missing") {
      throw Object.assign(new Error("not found"), { status: 404 });
    }
    if (state instanceof Error) {
      throw state;
    }
    return { type: "file" as const, path: input.path };
  }

  async getDefaultBranch(
    input: { owner: string; repo: string },
    token: string,
  ) {
    this.calls.push({ kind: "getDefaultBranch", token });
    return {
      branchName: "main",
      headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
  }

  async createBranch(
    input: { owner: string; repo: string; branchName: string; fromSha: string },
    token: string,
  ): Promise<void> {
    this.calls.push({ kind: "createBranch", token });
  }

  async createFile(
    input: { owner: string; repo: string; path: string; branchName: string; content: string },
    token: string,
  ): Promise<void> {
    this.calls.push({ kind: "createFile", token });
    this.createdFiles.push({
      path: input.path,
      content: input.content,
      branchName: input.branchName,
    });
  }

  async createPullRequest(
    input: { owner: string; repo: string; title: string; body: string; head: string; base: string },
    token: string,
  ) {
    this.calls.push({ kind: "createPullRequest", token });
    this.pullRequests.push(input);
    return {
      number: 42,
      url: "https://github.com/kaelah971/repo-301/pull/42",
    };
  }
}

function addRepositoryFixtures(store: FakeRepositoryStore): void {
  store.installations.set(REPOSITORY_INSTALLATION_ID, {
    installationId: REPOSITORY_INSTALLATION_ID,
    installedByGithubUserId: GITHUB_USER_ID,
    boundByAuthUserId: AUTH_USER_ID,
    connectionState: "ACTIVE",
  });
  store.installations.set(OTHER_INSTALLATION_ID, {
    installationId: OTHER_INSTALLATION_ID,
    installedByGithubUserId: 202,
    boundByAuthUserId: OTHER_AUTH_USER_ID,
    connectionState: "ACTIVE",
  });
  store.installations.set(UNBOUND_INSTALLATION_ID, {
    installationId: UNBOUND_INSTALLATION_ID,
    installedByGithubUserId: 203,
    boundByAuthUserId: null,
    connectionState: "ACTIVE",
  });
  store.installations.set(DISCONNECTED_INSTALLATION_ID, {
    installationId: DISCONNECTED_INSTALLATION_ID,
    installedByGithubUserId: GITHUB_USER_ID,
    boundByAuthUserId: AUTH_USER_ID,
    connectionState: "DISCONNECTED",
  });
  store.repositories.set(301, repositoryFixture(301, REPOSITORY_INSTALLATION_ID, {
    repositoryName: "limen",
    fullName: "kaelah971/limen",
    latestDecision: "REVIEW",
    latestEvaluationAt: "2026-09-06T00:00:00.000Z",
    setupPullRequest: {
      repositoryId: 301,
      prNumber: 7,
      prUrl: "https://github.com/kaelah971/limen/pull/7",
      branchName: "limen/setup-301-1700000000",
      state: "OPEN",
    },
  }));
  store.repositories.set(SECOND_REPOSITORY_ID, repositoryFixture(
    SECOND_REPOSITORY_ID,
    OTHER_INSTALLATION_ID,
  ));
  store.repositories.set(UNBOUND_REPOSITORY_ID, repositoryFixture(
    UNBOUND_REPOSITORY_ID,
    UNBOUND_INSTALLATION_ID,
  ));
  store.repositories.set(DISCONNECTED_REPOSITORY_ID, repositoryFixture(
    DISCONNECTED_REPOSITORY_ID,
    DISCONNECTED_INSTALLATION_ID,
    { lifecycleState: "DISCONNECTED" },
  ));
}

function makeRepositorySetupService(
  store: FakeRepositoryStore,
  transport: FakeRepositoryGitHubTransport,
) {
  const installationClient = createGitHubInstallationClient({
    getInstallationState: (installationId) => store.getInstallationState(installationId),
    mintInstallationToken: async (installationId) => {
      store.mintCount += 1;
      return INSTALLATION_TOKEN;
    },
    transport,
  });
  return createSetupService({
    installationClient,
    persistence: store,
    setupConfig: SETUP_CONFIG,
    now: () => 1_700_000_000_000,
  });
}

const repositoryServers: ReturnType<typeof createLedgerServer>[] = [];

afterEach(async () => {
  await Promise.all(repositoryServers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function startRepositoryServer(
  store: FakeRepositoryStore,
  client: UserAuthClient,
  setupService: ReturnType<typeof makeRepositorySetupService>,
): Promise<string> {
  const server = createLedgerServer({
    ledger: {
      persistRun: async () => ({ id: "LM-RUN-REPOSITORY-TEST", created: true }),
      getRun: async () => null,
    },
    ingestToken: "ingest-secret",
    githubRepositoryApi: {
      authClient: client,
      store,
      setupService,
      setupConfig: SETUP_CONFIG,
    },
  } as never);
  repositoryServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function repositoryRequest(
  url: string,
  path: string,
  method = "GET",
  token: string | null = "valid-token",
): Promise<Response> {
  return fetch(`${url}${path}`, {
    method,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

describe("authenticated repository APIs", () => {
  it("retains merged setup PR metadata without treating it as an open duplicate", async () => {
    const repositoryQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    repositoryQuery.select.mockReturnValue(repositoryQuery);
    repositoryQuery.eq.mockReturnValue(repositoryQuery);
    repositoryQuery.neq.mockReturnValue(repositoryQuery);
    repositoryQuery.maybeSingle.mockResolvedValue({
      data: {
        repository_id: 301,
        installation_id: 401,
        owner_login: "kaelah971",
        repository_name: "limen",
        full_name: "kaelah971/limen",
        default_branch: "main",
        lifecycle_state: "VERIFIED",
        latest_decision: "PASS",
        latest_evaluation_at: "2026-09-06T02:00:00.000Z",
      },
      error: null,
    });

    let stateFilter: string | undefined;
    const mergedSetupPullRequest = {
      repository_id: 301,
      pr_number: 42,
      pr_url: "https://github.com/kaelah971/limen/pull/42",
      branch_name: "limen/setup-301-1700000000",
      state: "MERGED",
    };
    const setupQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(),
    };
    setupQuery.select.mockReturnValue(setupQuery);
    setupQuery.eq.mockImplementation((column: string, value: string) => {
      if (column === "state") {
        stateFilter = value;
      }
      return setupQuery;
    });
    setupQuery.order.mockReturnValue(setupQuery);
    setupQuery.limit.mockReturnValue(setupQuery);
    setupQuery.maybeSingle.mockImplementation(async () => ({
      data: stateFilter === "OPEN" ? null : mergedSetupPullRequest,
      error: null,
    }));

    const client = {
      from: vi.fn((table: string) => {
        if (table === "github_repositories") {
          return repositoryQuery;
        }
        if (table === "github_setup_prs") {
          return setupQuery;
        }
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    };
    const store = new SupabaseGitHubAppStore(client as never);
    const response = await handleGitHubRepositoryRequest(
      { method: "GET", headers: { authorization: "Bearer valid-token" } } as never,
      ["v1", "github", "repositories", "301"],
      {
        authClient: authClient({ user: githubAuthUser(), error: null }),
        store,
        setupService: {} as never,
        setupConfig: SETUP_CONFIG,
      },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      repositoryId: 301,
      lifecycleState: "VERIFIED",
      latestDecision: "PASS",
      setupPullRequest: {
        number: 42,
        url: "https://github.com/kaelah971/limen/pull/42",
        state: "MERGED",
      },
    });
    expect(setupQuery.order).toHaveBeenCalledWith("updated_at", { ascending: false });

    stateFilter = undefined;
    await expect(store.getOpenSetupPullRequest(301)).resolves.toBeNull();
    expect(setupQuery.eq).toHaveBeenCalledWith("state", "OPEN");
  });

  it("lists only repositories from installations bound to the current user", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(url, "/v1/github/repositories");
    const body = await response.json() as { repositories: RepositoryFixture[] };

    expect(response.status).toBe(200);
    expect(body.repositories.map((repository) => repository.repositoryId)).toEqual([301]);
    expect(body.repositories.find((repository) => repository.repositoryId === 301)).toMatchObject({
      owner: "kaelah971",
      name: "limen",
      fullName: "kaelah971/limen",
      defaultBranch: "main",
      lifecycleState: "SETUP_REQUIRED",
      latestDecision: "REVIEW",
      latestEvaluationAt: "2026-09-06T00:00:00.000Z",
      setupPullRequest: {
        number: 7,
        url: "https://github.com/kaelah971/limen/pull/7",
        state: "OPEN",
      },
    });
    expect(JSON.stringify(body)).not.toContain(INSTALLATION_TOKEN);
    expect(JSON.stringify(body)).not.toContain("private-key-fixture");
    expect(JSON.stringify(body)).not.toContain("service-role-fixture");
  });

  it("hides another user's and unbound repositories from direct access", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const otherUserResponse = await repositoryRequest(
      url,
      `/v1/github/repositories/${SECOND_REPOSITORY_ID}`,
    );
    const unboundResponse = await repositoryRequest(
      url,
      `/v1/github/repositories/${UNBOUND_REPOSITORY_ID}`,
    );

    expect(otherUserResponse.status).toBe(404);
    expect(unboundResponse.status).toBe(404);
  });

  it("keeps sanitized history readable for the bound user after disconnect", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    const history = [
      {
        githubRunId: 402,
        githubRunAttempt: 1,
        workflowRef: "kaelah971/limen/.github/workflows/limen.yml@refs/heads/main",
        commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        decision: "HOLD" as const,
        receiptId: "receipt-402",
        evaluatedAt: "2026-09-06T02:00:00.000Z",
      },
      {
        githubRunId: 401,
        githubRunAttempt: 1,
        workflowRef: "kaelah971/limen/.github/workflows/limen.yml@refs/heads/main",
        commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decision: "PASS" as const,
        receiptId: null,
        evaluatedAt: "2026-09-06T01:00:00.000Z",
      },
    ];
    store.historicalEvaluations.set(301, history);
    store.historicalEvaluations.set(DISCONNECTED_REPOSITORY_ID, [{
      ...history[0],
      githubRunId: 404,
    }]);
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const activeHistoryResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/evaluations",
    );
    const disconnectedHistoryResponse = await repositoryRequest(
      url,
      `/v1/github/repositories/${DISCONNECTED_REPOSITORY_ID}/evaluations`,
    );
    const otherUserResponse = await repositoryRequest(
      url,
      `/v1/github/repositories/${SECOND_REPOSITORY_ID}/evaluations`,
    );
    const unboundResponse = await repositoryRequest(
      url,
      `/v1/github/repositories/${UNBOUND_REPOSITORY_ID}/evaluations`,
    );

    expect(activeHistoryResponse.status).toBe(200);
    expect(await activeHistoryResponse.json()).toEqual({
      repositoryId: 301,
      evaluations: history,
    });
    expect(disconnectedHistoryResponse.status).toBe(200);
    expect(await disconnectedHistoryResponse.json()).toMatchObject({
      repositoryId: DISCONNECTED_REPOSITORY_ID,
      evaluations: [{ githubRunId: 404, decision: "HOLD" }],
    });
    expect(otherUserResponse.status).toBe(404);
    expect(unboundResponse.status).toBe(404);
    expect(store.historyLimits).toEqual([100, 100, 100, 100]);
    expect(JSON.stringify(history)).not.toMatch(/token|private|secret|password/i);
  });

  it("requires authentication before repository access", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(url, "/v1/github/repositories", "GET", null);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "GITHUB_AUTH_REQUIRED" });
  });

  it("returns a read-only setup preview without changing state or writing to GitHub", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-preview",
    );
    const body = await response.json() as {
      repositoryId: number;
      filesToCreate: string[];
      alreadyConfigured: boolean;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      repositoryId: 301,
      filesToCreate: ["limen.yml", ".github/workflows/limen.yml"],
      alreadyConfigured: false,
    });
    expect(transport.calls.map((call) => call.kind)).toEqual([
      "getRepositoryFile",
      "getRepositoryFile",
      "getRepositoryFile",
    ]);
    expect(transport.createdFiles).toHaveLength(0);
    expect(transport.pullRequests).toHaveLength(0);
    expect(store.transitionCount).toBe(0);
    expect(store.repositories.get(301)?.lifecycleState).toBe("SETUP_REQUIRED");
  });

  it("creates a setup PR only through POST and persists SETUP_PR_OPEN", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );
    const body = await response.json() as {
      code: string;
      setupPullRequest?: { number: number; url: string; state: string };
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: "SETUP_PR_CREATED",
      setupPullRequest: {
        number: 42,
        url: "https://github.com/kaelah971/repo-301/pull/42",
        state: "OPEN",
      },
    });
    expect(store.repositories.get(301)?.lifecycleState).toBe("SETUP_PR_OPEN");
    expect(store.transitionCount).toBe(1);
  });

  it("returns the existing open setup PR without new GitHub work", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    const transport = new FakeRepositoryGitHubTransport();
    const setupService = makeRepositorySetupService(store, transport);
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      setupService,
    );

    const firstResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );
    const secondResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );
    const secondBody = await secondResponse.json() as { code: string };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondBody.code).toBe("OPEN_SETUP_PR_EXISTS");
    expect(store.mintCount).toBe(1);
    expect(transport.pullRequests).toHaveLength(1);
    expect(store.recordedSetupPullRequests).toHaveLength(1);
    expect(store.transitionCount).toBe(1);
  });

  it("proposes and creates only the missing setup file", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    const transport = new FakeRepositoryGitHubTransport();
    transport.files.set("limen.yml", "present");
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const previewResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-preview",
    );
    const preview = await previewResponse.json() as { filesToCreate: string[] };
    const createResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );

    expect(preview.filesToCreate).toEqual([".github/workflows/limen.yml"]);
    expect(createResponse.status).toBe(200);
    expect(transport.createdFiles.map((file) => file.path)).toEqual([
      ".github/workflows/limen.yml",
    ]);
  });

  it("surfaces an existing workflow and never overwrites it", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    const transport = new FakeRepositoryGitHubTransport();
    transport.files.set(".github/workflows/limen.yml", "present");
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const previewResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-preview",
    );
    const preview = await previewResponse.json() as { filesToCreate: string[] };
    const createResponse = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );

    expect(preview.filesToCreate).toEqual(["limen.yml"]);
    expect(createResponse.status).toBe(200);
    expect(transport.createdFiles.map((file) => file.path)).toEqual(["limen.yml"]);
  });

  it("returns SETUP_FILES_CONFLICT without setup writes", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    const transport = new FakeRepositoryGitHubTransport();
    transport.files.set("limen.yml", "present");
    transport.files.set(".github/workflows/limen.yml", "present");
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );
    const body = await response.json() as { code: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe("SETUP_FILES_CONFLICT");
    expect(transport.createdFiles).toHaveLength(0);
    expect(transport.pullRequests).toHaveLength(0);
    expect(store.recordedSetupPullRequests).toHaveLength(0);
    expect(store.transitionCount).toBe(0);
    expect(store.repositories.get(301)?.lifecycleState).toBe("SETUP_REQUIRED");
  });

  it("does not treat GitHub inspection errors as missing files", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    const transport = new FakeRepositoryGitHubTransport();
    transport.files.set("limen.yml", Object.assign(new Error("forbidden"), { status: 403 }));
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-preview",
    );
    const body = await response.json() as { code: string };

    expect(response.status).toBe(502);
    expect(body.code).toBe("SETUP_PR_FAILED");
    expect(store.repositories.get(301)?.lifecycleState).toBe("SETUP_REQUIRED");
  });

  it("rejects setup actions for disconnected installations before token minting", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const previewResponse = await repositoryRequest(
      url,
      `/v1/github/repositories/${DISCONNECTED_REPOSITORY_ID}/setup-preview`,
    );
    expect(previewResponse.status).toBe(409);
    expect(await previewResponse.json()).toMatchObject({ code: "INSTALLATION_DISCONNECTED" });
    expect(store.mintCount).toBe(0);
    expect(transport.calls).toHaveLength(0);

    const response = await repositoryRequest(
      url,
      `/v1/github/repositories/${DISCONNECTED_REPOSITORY_ID}/setup-pr`,
      "POST",
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "INSTALLATION_DISCONNECTED" });
    expect(store.mintCount).toBe(0);
    expect(transport.calls).toHaveLength(0);
    expect(store.recordedSetupPullRequests).toHaveLength(0);
  });

  it("does not claim setup success when persistence fails", async () => {
    const store = new FakeRepositoryStore();
    addRepositoryFixtures(store);
    store.repositories.get(301)!.setupPullRequest = null;
    store.recordError = new Error("database failure with service-role-fixture");
    const transport = new FakeRepositoryGitHubTransport();
    const url = await startRepositoryServer(
      store,
      authClient({ user: githubAuthUser(), error: null }),
      makeRepositorySetupService(store, transport),
    );

    const response = await repositoryRequest(
      url,
      "/v1/github/repositories/301/setup-pr",
      "POST",
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain("SETUP_PR_FAILED");
    expect(body).not.toContain("service-role-fixture");
    expect(store.repositories.get(301)?.lifecycleState).toBe("SETUP_REQUIRED");
  });
});
