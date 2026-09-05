import { z } from "zod";
import { GitHubConfigurationError } from "./errors";
import type { GitHubConfig } from "./types";

export const GITHUB_API_VERSION = "2026-03-10";
export const GITHUB_API_URL = "https://api.github.com";

const EnvironmentSchema = z.object({
  GITHUB_API_URL: z.literal(GITHUB_API_URL).default(GITHUB_API_URL),
  GITHUB_API_VERSION: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(GITHUB_API_VERSION),
  GITHUB_TOKEN: z.string().min(1).optional(),
  GITHUB_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
});

export function loadGitHubConfig(
  environment: Record<string, string | undefined> = process.env,
): GitHubConfig {
  const parsed = EnvironmentSchema.safeParse({
    GITHUB_API_URL: environment.GITHUB_API_URL ?? GITHUB_API_URL,
    GITHUB_API_VERSION: environment.GITHUB_API_VERSION ?? GITHUB_API_VERSION,
    GITHUB_TOKEN: environment.GITHUB_TOKEN?.trim() || undefined,
    GITHUB_TIMEOUT_MS: environment.GITHUB_TIMEOUT_MS ?? "30000",
  });

  if (!parsed.success) {
    throw new GitHubConfigurationError("GitHub configuration is invalid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }

  return {
    apiUrl: parsed.data.GITHUB_API_URL.replace(/\/$/, ""),
    apiVersion: parsed.data.GITHUB_API_VERSION,
    ...(parsed.data.GITHUB_TOKEN === undefined
      ? {}
      : { token: parsed.data.GITHUB_TOKEN }),
    timeoutMs: parsed.data.GITHUB_TIMEOUT_MS,
  };
}

export function assertGitHubApiUrl(value: string): void {
  if (value !== GITHUB_API_URL) {
    throw new GitHubConfigurationError(
      "GitHub API origin must be the trusted public GitHub API.",
      { field: "GITHUB_API_URL" },
    );
  }
}
