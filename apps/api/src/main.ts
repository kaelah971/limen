import { createLedgerServer } from "./server";
import { loadGitHubAppDeploymentConfig, loadLedgerApiConfig } from "./config";
import { SupabaseGitHubAppStore } from "./github-app-store";
import { SupabaseEvidenceLedger } from "./repository";
import { SupabaseEvidenceReceiptStore } from "./receipt-repository";
import { createServerSupabaseClient } from "./supabase";
import {
  createGitHubAppInstallationClient,
  createSetupService,
} from "../../../packages/github-app/src";

const config = loadLedgerApiConfig();
const githubDeploymentConfig = loadGitHubAppDeploymentConfig();
const client = createServerSupabaseClient(config);
const ledger = new SupabaseEvidenceLedger(client);
const receipts = new SupabaseEvidenceReceiptStore(client);
const githubStore = new SupabaseGitHubAppStore(client);
const setupConfig = {
  actionSha: githubDeploymentConfig.githubApp.actionSha,
  limenApiUrl: githubDeploymentConfig.publicApiUrl,
};
const installationClient = createGitHubAppInstallationClient(
  githubDeploymentConfig.githubApp,
  githubStore,
);
const setupService = createSetupService({
  installationClient,
  persistence: githubStore,
  setupConfig,
});
const server = createLedgerServer({
  ledger,
  receipts,
  ingestToken: config.ingestToken,
  githubWebhook: {
    secret: githubDeploymentConfig.githubApp.webhookSecret,
    store: githubStore,
  },
  githubInstallationBind: {
    authClient: client,
    store: githubStore,
  },
  githubRepositoryApi: {
    authClient: client,
    store: githubStore,
    setupService,
    setupConfig,
  },
  githubEvaluationApi: {
    store: githubStore,
    oidcAudience: githubDeploymentConfig.githubApp.oidcAudience,
  },
  githubIntegrationHealthApi: {
    store: githubStore,
    oidcAudience: githubDeploymentConfig.githubApp.oidcAudience,
  },
});

server.listen(config.port, config.host, () => {
  console.log(`Limen ledger API listening on ${config.host}:${config.port}`);
});
