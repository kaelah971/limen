import { z } from "zod";
import { LOCAL_HOSTS, parseOutboundUrl } from "../../../packages/core/src";
import {
  loadGitHubAppConfig,
  type GitHubAppConfig,
} from "../../../packages/github-app/src/config";

export interface LedgerApiConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  ingestToken: string;
  host: string;
  port: number;
}

export interface GitHubAppDeploymentConfig {
  githubApp: GitHubAppConfig;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  publicApiUrl: string;
}

const EnvironmentSchema = z.object({
  SUPABASE_URL: z.string().refine(isAllowedSupabaseUrl, {
    message: "SUPABASE_URL must use HTTPS except for explicit localhost development URLs.",
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  LIMEN_INGEST_TOKEN: z.string().trim().min(1),
  LIMEN_API_HOST: z.string().trim().min(1).max(255)
    .regex(/^[^\u0000-\u001F\u007F-\u009F]+$/)
    .default("127.0.0.1"),
  LIMEN_API_PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
});

function isAllowedSupabaseUrl(value: string): boolean {
  try {
    parseOutboundUrl(value, {
      name: "Supabase",
      allowHttpHosts: LOCAL_HOSTS,
    });
    return true;
  } catch {
    return false;
  }
}

function requiredDeploymentValue(
  environment: Record<string, string | undefined>,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function deploymentSupabaseUrl(
  environment: Record<string, string | undefined>,
): string {
  const value = requiredDeploymentValue(environment, "SUPABASE_URL");
  if (!isAllowedSupabaseUrl(value)) {
    throw new Error(
      "SUPABASE_URL must use HTTPS except for explicit localhost development URLs.",
    );
  }

  return value;
}

function deploymentPublicApiUrl(
  environment: Record<string, string | undefined>,
): string {
  const value = requiredDeploymentValue(environment, "LIMEN_PUBLIC_API_URL");
  parseOutboundUrl(value, {
    name: "LIMEN_PUBLIC_API_URL",
    allowHttpHosts: LOCAL_HOSTS,
  });
  return value.replace(/\/+$/, "");
}

export function loadLedgerApiConfig(
  environment: Record<string, string | undefined> = process.env,
): LedgerApiConfig {
  const parsed = EnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error("Ledger API configuration is invalid.");
  }

  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
    ingestToken: parsed.data.LIMEN_INGEST_TOKEN,
    host: parsed.data.LIMEN_API_HOST,
    port: parsed.data.LIMEN_API_PORT,
  };
}

export function loadGitHubAppDeploymentConfig(
  environment: Record<string, string | undefined> = process.env,
): GitHubAppDeploymentConfig {
  return {
    githubApp: loadGitHubAppConfig(environment),
    supabaseUrl: deploymentSupabaseUrl(environment),
    supabaseServiceRoleKey: requiredDeploymentValue(
      environment,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
    publicApiUrl: deploymentPublicApiUrl(environment),
  };
}
