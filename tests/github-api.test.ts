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
} from "../apps/api/src/github-app-store";
import {
  authenticateUser,
  type SupabaseAuthUser,
  type UserAuthClient,
} from "../apps/api/src/user-auth";
import { createLedgerServer } from "../apps/api/src/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260905000000_create_github_app_onboarding.sql";

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
