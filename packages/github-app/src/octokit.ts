import { createAppAuth } from "@octokit/auth-app";
import { Octokit, type Octokit as OctokitClient } from "@octokit/rest";
import {
  createGitHubInstallationClient,
  type GitHubInstallationClientDependencies,
  type GitHubInstallationClientFactory,
  type GitHubRepositoryFileInput,
  type GitHubSetupTransport,
} from "./client";
import type { GitHubAppConfig } from "./config";

export interface GitHubAppAdapterDependencies {
  createAppAuth?: typeof createAppAuth;
  Octokit?: typeof Octokit;
}

type InstallationStateDependency = Pick<
  GitHubInstallationClientDependencies,
  "getInstallationState"
>;

function noOpAuthCache() {
  return {
    get: () => undefined as never,
    set: () => undefined,
  };
}

function createAuthenticatedOctokit(
  token: string,
  OctokitConstructor: typeof Octokit,
): OctokitClient {
  return new OctokitConstructor({ auth: token });
}

function createTransport(
  OctokitConstructor: typeof Octokit,
): GitHubSetupTransport {
  function octokit(token: string): OctokitClient {
    return createAuthenticatedOctokit(token, OctokitConstructor);
  }

  return {
    async getRepositoryFile(input: GitHubRepositoryFileInput, token: string) {
      const result = await octokit(token).rest.repos.getContent({
        owner: input.owner,
        repo: input.repo,
        path: input.path,
        ref: input.ref,
      });
      return result.data as never;
    },
    async getDefaultBranch(input, token) {
      const client = octokit(token);
      const repository = await client.rest.repos.get({
        owner: input.owner,
        repo: input.repo,
      });
      const branchName = repository.data.default_branch;
      const branch = await client.rest.repos.getBranch({
        ...input,
        branch: branchName,
      });
      return {
        branchName,
        headSha: branch.data.commit.sha,
      };
    },
    async createBranch(input, token) {
      await octokit(token).rest.git.createRef({
        owner: input.owner,
        repo: input.repo,
        ref: `refs/heads/${input.branchName}`,
        sha: input.fromSha,
      });
    },
    async createFile(input, token) {
      await octokit(token).rest.repos.createOrUpdateFileContents({
        owner: input.owner,
        repo: input.repo,
        path: input.path,
        branch: input.branchName,
        message: "Configure Limen",
        content: Buffer.from(input.content, "utf8").toString("base64"),
      });
    },
    async createPullRequest(input, token) {
      const result = await octokit(token).rest.pulls.create({
        owner: input.owner,
        repo: input.repo,
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
      });
      return {
        number: result.data.number,
        url: result.data.html_url,
      };
    },
  };
}

export function createGitHubAppInstallationClient(
  config: GitHubAppConfig,
  dependencies: InstallationStateDependency,
  adapterDependencies: GitHubAppAdapterDependencies = {},
): GitHubInstallationClientFactory {
  const createAuth = adapterDependencies.createAppAuth ?? createAppAuth;
  const OctokitConstructor = adapterDependencies.Octokit ?? Octokit;
  const auth = createAuth({
    appId: config.appId,
    privateKey: config.privateKey,
    cache: noOpAuthCache(),
  });

  return createGitHubInstallationClient({
    getInstallationState: dependencies.getInstallationState,
    mintInstallationToken: async (installationId) => {
      const authentication = await auth({
        type: "installation",
        installationId,
      });
      return authentication.token;
    },
    transport: createTransport(OctokitConstructor),
  });
}
