const DEFAULT_OIDC_AUDIENCE = "limen-api";
const PEM_PATTERN = /^-----BEGIN [A-Z0-9 ]+-----\n[\s\S]+\n-----END [A-Z0-9 ]+-----$/;
const ACTION_SHA_PATTERN = /^[0-9a-fA-F]{40}$/;

export interface GitHubAppConfig {
  appId: number;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  oidcAudience: string;
  actionSha: string;
}

function requiredValue(
  environment: Record<string, string | undefined>,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parseAppId(environment: Record<string, string | undefined>): number {
  const value = requiredValue(environment, "GITHUB_APP_ID");
  if (!/^\d+$/.test(value)) {
    throw new Error("GITHUB_APP_ID must be a positive integer.");
  }

  const appId = Number(value);
  if (!Number.isSafeInteger(appId) || appId <= 0) {
    throw new Error("GITHUB_APP_ID must be a positive integer.");
  }

  return appId;
}

function parsePrivateKey(
  environment: Record<string, string | undefined>,
): string {
  const value = requiredValue(environment, "GITHUB_APP_PRIVATE_KEY")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");
  if (!PEM_PATTERN.test(value)) {
    throw new Error("GITHUB_APP_PRIVATE_KEY must be a PEM private key.");
  }

  return value;
}

function parseWebhookSecret(
  environment: Record<string, string | undefined>,
): string {
  const value = requiredValue(environment, "GITHUB_WEBHOOK_SECRET");
  if (value.length < 32) {
    throw new Error("GITHUB_WEBHOOK_SECRET must be at least 32 characters.");
  }

  return value;
}

function parseActionSha(
  environment: Record<string, string | undefined>,
): string {
  const value = requiredValue(environment, "LIMEN_ACTION_SHA");
  if (!ACTION_SHA_PATTERN.test(value)) {
    throw new Error("LIMEN_ACTION_SHA must be exactly 40 hexadecimal characters.");
  }

  return value;
}

export function loadGitHubAppConfig(
  environment: Record<string, string | undefined> = process.env,
): GitHubAppConfig {
  const appSlug = requiredValue(environment, "GITHUB_APP_SLUG");
  const oidcAudience =
    environment.LIMEN_GITHUB_OIDC_AUDIENCE?.trim() || DEFAULT_OIDC_AUDIENCE;

  return {
    appId: parseAppId(environment),
    appSlug,
    privateKey: parsePrivateKey(environment),
    webhookSecret: parseWebhookSecret(environment),
    oidcAudience,
    actionSha: parseActionSha(environment),
  };
}
