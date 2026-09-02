import {
  isLimenError,
  LimenPolicyNotFoundError,
  parseLimenPolicy,
} from "../../packages/core/src";
import {
  GitHubResponseError,
  type GitHubClient,
} from "../../packages/github/src";
import type { ActionPullRequestContext } from "./types";

function isNotFound(error: unknown): boolean {
  return isLimenError(error) && error.code === "GITHUB_API_ERROR" && error.details?.status === 404;
}

function decodePolicyContent(content: string, path: string): string {
  const normalized = content.replace(/\s+/g, "");
  const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (normalized === "" || !validBase64.test(normalized)) {
    throw new GitHubResponseError("GitHub returned invalid base64 policy content.", {
      path,
    });
  }

  return Buffer.from(normalized, "base64").toString("utf8");
}

export async function loadBaseCommitPolicy(
  githubClient: GitHubClient,
  context: ActionPullRequestContext,
) {
  for (const path of ["limen.yml", "limen.yaml"] as const) {
    try {
      const response = await githubClient.getRepositoryFile({
        owner: context.owner,
        repo: context.repo,
        path,
        ref: context.baseSha,
      });
      const source = decodePolicyContent(response.data.content, path);
      return parseLimenPolicy(source, `${path}@${context.baseSha}`);
    } catch (error) {
      if (isNotFound(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new LimenPolicyNotFoundError(
    "No limen.yml or limen.yaml policy file was found at the pull request base commit.",
    { baseSha: context.baseSha },
  );
}
