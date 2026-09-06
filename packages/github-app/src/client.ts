const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export type InstallationConnectionState = "ACTIVE" | "DISCONNECTED";

export interface GitHubRepositoryFileInput {
  owner: string;
  repo: string;
  path: string;
  ref: string;
}

export interface GitHubRepositoryFileResponse {
  type: "file";
  path: string;
}

export interface GitHubDefaultBranchInput {
  owner: string;
  repo: string;
}

export interface GitHubDefaultBranchResponse {
  branchName: string;
  headSha: string;
}

export interface GitHubCreateBranchInput {
  owner: string;
  repo: string;
  branchName: string;
  fromSha: string;
}

export interface GitHubCreateFileInput {
  owner: string;
  repo: string;
  path: string;
  branchName: string;
  content: string;
}

export interface GitHubCreatePullRequestInput {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface GitHubPullRequestResponse {
  number: number;
  url: string;
}

export interface GitHubSetupTransport {
  getRepositoryFile(
    input: GitHubRepositoryFileInput,
    token: string,
  ): Promise<GitHubRepositoryFileResponse>;
  getDefaultBranch(
    input: GitHubDefaultBranchInput,
    token: string,
  ): Promise<GitHubDefaultBranchResponse>;
  createBranch(input: GitHubCreateBranchInput, token: string): Promise<void>;
  createFile(input: GitHubCreateFileInput, token: string): Promise<void>;
  createPullRequest(
    input: GitHubCreatePullRequestInput,
    token: string,
  ): Promise<GitHubPullRequestResponse>;
}

export interface GitHubInstallationApi {
  getRepositoryFile(
    input: GitHubRepositoryFileInput,
  ): Promise<GitHubRepositoryFileResponse>;
  getDefaultBranch(
    input: GitHubDefaultBranchInput,
  ): Promise<GitHubDefaultBranchResponse>;
  createBranch(input: GitHubCreateBranchInput): Promise<void>;
  createFile(input: GitHubCreateFileInput): Promise<void>;
  createPullRequest(
    input: GitHubCreatePullRequestInput,
  ): Promise<GitHubPullRequestResponse>;
}

export interface GitHubInstallationClientDependencies {
  getInstallationState(
    installationId: number,
  ): Promise<InstallationConnectionState>;
  mintInstallationToken(installationId: number): Promise<string>;
  transport: GitHubSetupTransport;
}

export interface GitHubInstallationClientFactory {
  withInstallationClient<T>(
    installationId: number,
    fn: (client: GitHubInstallationApi) => Promise<T>,
  ): Promise<T>;
}

export class GitHubInstallationClientError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "GitHubInstallationClientError";
    this.code = code;
    this.status = status;
  }
}

function validInstallationId(installationId: number): boolean {
  return Number.isSafeInteger(installationId) && installationId > 0;
}

function transportStatus(error: unknown): number | undefined {
  if (error !== null && typeof error === "object" && "status" in error) {
    const status = error.status;
    return typeof status === "number" && Number.isInteger(status) ? status : undefined;
  }
  return undefined;
}

function transportFailure(error: unknown): GitHubInstallationClientError {
  const status = transportStatus(error);
  return new GitHubInstallationClientError(
    "GITHUB_INSTALLATION_REQUEST_FAILED",
    "The GitHub installation request failed.",
    status,
  );
}

function responseFailure(): GitHubInstallationClientError {
  return new GitHubInstallationClientError(
    "GITHUB_INSTALLATION_RESPONSE_INVALID",
    "The GitHub installation returned an invalid response.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scopedToken(tokenScope: { value: string; active: boolean }): string {
  if (!tokenScope.active || tokenScope.value === "") {
    throw new GitHubInstallationClientError(
      "GITHUB_INSTALLATION_REQUEST_FAILED",
      "The GitHub installation request failed.",
    );
  }
  return tokenScope.value;
}

function bindTransport(
  transport: GitHubSetupTransport,
  tokenScope: { value: string; active: boolean },
): GitHubInstallationApi {
  return {
    async getRepositoryFile(input) {
      let result: unknown;
      try {
        result = await transport.getRepositoryFile(input, scopedToken(tokenScope));
      } catch (error) {
        throw transportFailure(error);
      }
      if (!isRecord(result) || result.type !== "file" || typeof result.path !== "string") {
        throw responseFailure();
      }
      return { type: "file", path: result.path };
    },
    async getDefaultBranch(input) {
      let result: unknown;
      try {
        result = await transport.getDefaultBranch(input, scopedToken(tokenScope));
      } catch (error) {
        throw transportFailure(error);
      }
      if (
        !isRecord(result) ||
        typeof result.branchName !== "string" ||
        result.branchName.trim() === "" ||
        typeof result.headSha !== "string" ||
        !FULL_SHA_PATTERN.test(result.headSha)
      ) {
        throw responseFailure();
      }
      return {
        branchName: result.branchName,
        headSha: result.headSha,
      };
    },
    async createBranch(input) {
      try {
        await transport.createBranch(input, scopedToken(tokenScope));
      } catch (error) {
        throw transportFailure(error);
      }
    },
    async createFile(input) {
      try {
        await transport.createFile(input, scopedToken(tokenScope));
      } catch (error) {
        throw transportFailure(error);
      }
    },
    async createPullRequest(input) {
      let result: unknown;
      try {
        result = await transport.createPullRequest(input, scopedToken(tokenScope));
      } catch (error) {
        throw transportFailure(error);
      }
      if (
        !isRecord(result) ||
        typeof result.number !== "number" ||
        !Number.isSafeInteger(result.number) ||
        result.number <= 0 ||
        typeof result.url !== "string" ||
        !result.url.startsWith("https://")
      ) {
        throw responseFailure();
      }
      return { number: result.number, url: result.url };
    },
  };
}

export async function withInstallationClient<T>(
  installationId: number,
  fn: (client: GitHubInstallationApi) => Promise<T>,
  dependencies: GitHubInstallationClientDependencies,
): Promise<T> {
  if (!validInstallationId(installationId)) {
    throw new GitHubInstallationClientError(
      "GITHUB_INSTALLATION_INVALID",
      "The GitHub installation ID is invalid.",
    );
  }

  const tokenScope = { value: "", active: false };
  try {
    let state: InstallationConnectionState;
    try {
      state = await dependencies.getInstallationState(installationId);
    } catch {
      throw new GitHubInstallationClientError(
        "GITHUB_INSTALLATION_STATE_UNAVAILABLE",
        "The GitHub installation state is unavailable.",
      );
    }
    if (state !== "ACTIVE") {
      throw new GitHubInstallationClientError(
        "GITHUB_INSTALLATION_DISCONNECTED",
        "The GitHub installation is disconnected.",
      );
    }

    try {
      tokenScope.value = await dependencies.mintInstallationToken(installationId);
    } catch {
      throw new GitHubInstallationClientError(
        "GITHUB_INSTALLATION_TOKEN_UNAVAILABLE",
        "A GitHub installation token could not be created.",
      );
    }
    if (typeof tokenScope.value !== "string" || tokenScope.value.trim() === "") {
      throw new GitHubInstallationClientError(
        "GITHUB_INSTALLATION_TOKEN_UNAVAILABLE",
        "A GitHub installation token could not be created.",
      );
    }

    try {
      tokenScope.active = true;
      return await fn(bindTransport(dependencies.transport, tokenScope));
    } catch (error) {
      if (error instanceof GitHubInstallationClientError) {
        throw error;
      }
      throw new GitHubInstallationClientError(
        "GITHUB_INSTALLATION_REQUEST_FAILED",
        "The GitHub installation request failed.",
      );
    }
  } finally {
    tokenScope.active = false;
    tokenScope.value = "";
  }
}

export function createGitHubInstallationClient(
  dependencies: GitHubInstallationClientDependencies,
): GitHubInstallationClientFactory {
  return {
    withInstallationClient: (installationId, fn) =>
      withInstallationClient(installationId, fn, dependencies),
  };
}
