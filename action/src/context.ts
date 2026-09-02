import { z } from "zod";
import { GitHubConfigurationError } from "../../packages/github/src";
import type { ActionPullRequestContext } from "./types";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

const PullRequestPayloadSchema = z.object({
  pull_request: z.object({
    number: z.number().int().positive(),
    base: z.object({ sha: z.string() }).passthrough(),
    head: z.object({ sha: z.string() }).passthrough(),
    author_association: z.string().nullable().optional(),
    user: z.object({ login: z.string() }).nullable().optional(),
  }).passthrough(),
  sender: z.object({ login: z.string() }).nullable().optional(),
}).passthrough();

export interface ParsePullRequestContextInput {
  eventName: string;
  payload: unknown;
  owner: string;
  repo: string;
  actor?: string;
}

function requiredContextValue(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new GitHubConfigurationError(`GitHub Action ${field} is required.`, { field });
  }
  return normalized;
}

export function parsePullRequestContext(
  input: ParsePullRequestContextInput,
): ActionPullRequestContext {
  if (input.eventName !== "pull_request" && input.eventName !== "pull_request_target") {
    throw new GitHubConfigurationError(
      "Limen supports only pull_request and pull_request_target events.",
      { eventName: input.eventName },
    );
  }

  const parsed = PullRequestPayloadSchema.safeParse(input.payload);
  if (!parsed.success) {
    throw new GitHubConfigurationError("GitHub pull request context is invalid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }

  const pullRequest = parsed.data.pull_request;
  if (!FULL_SHA_PATTERN.test(pullRequest.base.sha) || !FULL_SHA_PATTERN.test(pullRequest.head.sha)) {
    throw new GitHubConfigurationError(
      "GitHub pull request base and head must be full 40-character commit SHAs.",
      { field: "pull_request.sha" },
    );
  }

  const owner = requiredContextValue(input.owner, "owner");
  const repo = requiredContextValue(input.repo, "repo");
  const actor = input.actor?.trim() || parsed.data.sender?.login?.trim() || pullRequest.user?.login?.trim() || "unknown";
  const authorAssociation = pullRequest.author_association?.trim().toUpperCase() || "UNKNOWN";

  return {
    owner,
    repo,
    repository: `${owner}/${repo}`,
    pullRequestNumber: pullRequest.number,
    baseSha: pullRequest.base.sha.toLowerCase(),
    headSha: pullRequest.head.sha.toLowerCase(),
    actor,
    eventName: input.eventName,
    authorAssociation,
  };
}
