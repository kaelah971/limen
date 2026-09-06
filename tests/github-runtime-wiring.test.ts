import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createLedgerServer: vi.fn(),
  loadLedgerApiConfig: vi.fn(),
  loadGitHubAppDeploymentConfig: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  SupabaseEvidenceLedger: vi.fn(),
  SupabaseEvidenceReceiptStore: vi.fn(),
}));

vi.mock("../apps/api/src/server", () => ({
  createLedgerServer: mocks.createLedgerServer,
}));

vi.mock("../apps/api/src/config", () => ({
  loadLedgerApiConfig: mocks.loadLedgerApiConfig,
  loadGitHubAppDeploymentConfig: mocks.loadGitHubAppDeploymentConfig,
}));

vi.mock("../apps/api/src/supabase", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));

vi.mock("../apps/api/src/repository", () => ({
  SupabaseEvidenceLedger: mocks.SupabaseEvidenceLedger,
}));

vi.mock("../apps/api/src/receipt-repository", () => ({
  SupabaseEvidenceReceiptStore: mocks.SupabaseEvidenceReceiptStore,
}));

const LEDGER_CONFIG = {
  supabaseUrl: "https://fixture.supabase.co",
  supabaseServiceRoleKey: "supabase-service-role-key-fixture",
  ingestToken: "ledger-ingest-token-fixture",
  host: "127.0.0.1",
  port: 8787,
};

const GITHUB_DEPLOYMENT_CONFIG = {
  githubApp: {
    appId: 12345,
    appSlug: "limen-fixture",
    privateKey: "-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----",
    webhookSecret: "github-webhook-secret-fixture-0123456789",
    oidcAudience: "limen-api",
    actionSha: "0123456789abcdef0123456789abcdef01234567",
  },
  supabaseUrl: LEDGER_CONFIG.supabaseUrl,
  supabaseServiceRoleKey: LEDGER_CONFIG.supabaseServiceRoleKey,
  publicApiUrl: "https://api.limen.example",
};

describe("GitHub App production runtime wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createLedgerServer.mockReset();
    mocks.loadLedgerApiConfig.mockReset();
    mocks.loadGitHubAppDeploymentConfig.mockReset();
    mocks.createServerSupabaseClient.mockReset();
    mocks.SupabaseEvidenceLedger.mockReset();
    mocks.SupabaseEvidenceReceiptStore.mockReset();

    mocks.loadLedgerApiConfig.mockReturnValue(LEDGER_CONFIG);
    mocks.loadGitHubAppDeploymentConfig.mockReturnValue(GITHUB_DEPLOYMENT_CONFIG);
    mocks.createServerSupabaseClient.mockReturnValue({
      auth: { getUser: vi.fn() },
    });
    mocks.SupabaseEvidenceLedger.mockImplementation(function FakeEvidenceLedger() {
      return { persistRun: vi.fn(), getRun: vi.fn() };
    });
    mocks.SupabaseEvidenceReceiptStore.mockImplementation(function FakeReceiptStore() {
      return { publishReceipt: vi.fn(), getReceipt: vi.fn(), revokeReceipt: vi.fn() };
    });
    mocks.createLedgerServer.mockReturnValue({ listen: vi.fn() });
  });

  it("passes every GitHub App route dependency to the production server", async () => {
    await import("../apps/api/src/main");

    expect(mocks.createLedgerServer).toHaveBeenCalledOnce();
    const options = mocks.createLedgerServer.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(options.githubWebhook).toBeDefined();
    expect(options.githubInstallationBind).toBeDefined();
    expect(options.githubRepositoryApi).toBeDefined();
    expect(options.githubEvaluationApi).toBeDefined();
    expect(options.githubIntegrationHealthApi).toBeDefined();
  });
});
