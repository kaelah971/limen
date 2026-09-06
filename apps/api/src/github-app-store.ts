import type { SupabaseClient } from "@supabase/supabase-js";

export interface GitHubRepositoryMetadata {
  repositoryId: number;
  ownerLogin: string;
  repositoryName: string;
  fullName: string;
  defaultBranch: string;
}

export interface InstallationCreatedInput {
  installationId: number;
  accountId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  installedByGithubUserId: number;
  repositories: readonly GitHubRepositoryMetadata[];
}

export interface SetupPullRequestClosedInput {
  repositoryId: number;
  pullRequestNumber: number;
  merged: boolean;
}

export interface GitHubUserInput {
  authUserId: string;
  githubUserId: number;
  githubLogin: string;
}

export interface GitHubInstallationRecord {
  installationId: number;
  installedByGithubUserId: number;
  boundByAuthUserId: string | null;
  connectionState: "ACTIVE" | "DISCONNECTED";
}

export interface GitHubInstallationAuthorizationStore {
  upsertGitHubUser(input: GitHubUserInput): Promise<void>;
  getInstallation(installationId: number): Promise<GitHubInstallationRecord | null>;
  bindInstallation(
    installationId: number,
    authUserId: string,
  ): Promise<"BOUND" | "ALREADY_BOUND">;
}

export interface GitHubWebhookDeliveryClaim {
  duplicate: boolean;
}

export interface GitHubAppStore {
  claimDelivery(
    deliveryId: string,
    eventName: string,
  ): Promise<GitHubWebhookDeliveryClaim>;
  recordInstallationCreated(input: InstallationCreatedInput): Promise<void>;
  disconnectInstallation(installationId: number): Promise<void>;
  addInstallationRepositories(
    installationId: number,
    repositories: readonly GitHubRepositoryMetadata[],
  ): Promise<void>;
  removeInstallationRepositories(
    installationId: number,
    repositoryIds: readonly number[],
  ): Promise<void>;
  syncSetupPullRequestClosed(input: SetupPullRequestClosedInput): Promise<void>;
}

export class GitHubAppStoreError extends Error {
  readonly code = "GITHUB_APP_STORE_ERROR" as const;

  constructor() {
    super("The GitHub App metadata store is unavailable.");
    this.name = "GitHubAppStoreError";
  }
}

export class GitHubInstallationNotConfirmedError extends Error {
  readonly code = "INSTALLATION_NOT_CONFIRMED" as const;

  constructor() {
    super("The GitHub installation has not been confirmed by a verified webhook.");
    this.name = "GitHubInstallationNotConfirmedError";
  }
}

export class GitHubInstallationDisconnectedError extends Error {
  readonly code = "INSTALLATION_DISCONNECTED" as const;

  constructor() {
    super("The GitHub installation is disconnected.");
    this.name = "GitHubInstallationDisconnectedError";
  }
}

export class GitHubInstallationAlreadyBoundError extends Error {
  readonly code = "INSTALLATION_ALREADY_BOUND" as const;

  constructor() {
    super("The GitHub installation is already bound to another Limen user.");
    this.name = "GitHubInstallationAlreadyBoundError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "23505";
}

function throwStoreError(error: unknown): never {
  if (error instanceof GitHubAppStoreError) {
    throw error;
  }
  throw new GitHubAppStoreError();
}

function repositoryRow(
  installationId: number,
  repository: GitHubRepositoryMetadata,
) {
  return {
    repository_id: repository.repositoryId,
    installation_id: installationId,
    owner_login: repository.ownerLogin,
    repository_name: repository.repositoryName,
    full_name: repository.fullName,
    default_branch: repository.defaultBranch,
    lifecycle_state: "SETUP_REQUIRED" as const,
  };
}

export class SupabaseGitHubAppStore implements GitHubAppStore, GitHubInstallationAuthorizationStore {
  constructor(private readonly client: SupabaseClient) {}

  async upsertGitHubUser(input: GitHubUserInput): Promise<void> {
    const { error } = await this.client
      .from("github_users")
      .upsert({
        auth_user_id: input.authUserId,
        github_user_id: input.githubUserId,
        github_login: input.githubLogin,
        updated_at: new Date().toISOString(),
      }, { onConflict: "auth_user_id" });
    if (error !== null) {
      throwStoreError(error);
    }
  }

  async getInstallation(installationId: number): Promise<GitHubInstallationRecord | null> {
    const { data, error } = await this.client
      .from("github_installations")
      .select("installation_id, installed_by_github_user_id, bound_by_auth_user_id, connection_state")
      .eq("installation_id", installationId)
      .maybeSingle();
    if (error !== null) {
      throwStoreError(error);
    }
    if (data === null) {
      return null;
    }
    const row = data as Record<string, unknown>;
    if (
      typeof row.installation_id !== "number"
      || !Number.isSafeInteger(row.installation_id)
      || typeof row.installed_by_github_user_id !== "number"
      || !Number.isSafeInteger(row.installed_by_github_user_id)
      || (row.bound_by_auth_user_id !== null && typeof row.bound_by_auth_user_id !== "string")
      || (row.connection_state !== "ACTIVE" && row.connection_state !== "DISCONNECTED")
    ) {
      throw new GitHubAppStoreError();
    }
    return {
      installationId: row.installation_id,
      installedByGithubUserId: row.installed_by_github_user_id,
      boundByAuthUserId: row.bound_by_auth_user_id,
      connectionState: row.connection_state,
    };
  }

  async bindInstallation(
    installationId: number,
    authUserId: string,
  ): Promise<"BOUND" | "ALREADY_BOUND"> {
    const { data, error } = await this.client
      .from("github_installations")
      .update({
        bound_by_auth_user_id: authUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("installation_id", installationId)
      .eq("connection_state", "ACTIVE")
      .is("bound_by_auth_user_id", null)
      .select("installation_id")
      .maybeSingle();
    if (error !== null) {
      throwStoreError(error);
    }
    if (data !== null) {
      return "BOUND";
    }

    const installation = await this.getInstallation(installationId);
    if (installation === null) {
      throw new GitHubInstallationNotConfirmedError();
    }
    if (installation.connectionState === "DISCONNECTED") {
      throw new GitHubInstallationDisconnectedError();
    }
    if (installation.boundByAuthUserId === authUserId) {
      return "ALREADY_BOUND";
    }
    throw new GitHubInstallationAlreadyBoundError();
  }

  async claimDelivery(
    deliveryId: string,
    eventName: string,
  ): Promise<GitHubWebhookDeliveryClaim> {
    const { error } = await this.client
      .from("github_webhook_deliveries")
      .insert({
        delivery_id: deliveryId,
        event_name: eventName,
      });
    if (error === null) {
      return { duplicate: false };
    }
    if (isUniqueViolation(error)) {
      return { duplicate: true };
    }
    throwStoreError(error);
  }

  async recordInstallationCreated(input: InstallationCreatedInput): Promise<void> {
    const { error: installationError } = await this.client
      .from("github_installations")
      .upsert({
        installation_id: input.installationId,
        account_id: input.accountId,
        account_login: input.accountLogin,
        account_type: input.accountType,
        installed_by_github_user_id: input.installedByGithubUserId,
        bound_by_auth_user_id: null,
        connection_state: "ACTIVE",
      }, { onConflict: "installation_id" });
    if (installationError !== null) {
      throwStoreError(installationError);
    }

    if (input.repositories.length === 0) {
      return;
    }

    const { error: repositoryError } = await this.client
      .from("github_repositories")
      .upsert(
        input.repositories.map((repository) =>
          repositoryRow(input.installationId, repository),
        ),
        { onConflict: "repository_id" },
      );
    if (repositoryError !== null) {
      throwStoreError(repositoryError);
    }
  }

  async disconnectInstallation(installationId: number): Promise<void> {
    const updatedAt = new Date().toISOString();
    const { error: installationError } = await this.client
      .from("github_installations")
      .update({
        connection_state: "DISCONNECTED",
        updated_at: updatedAt,
      })
      .eq("installation_id", installationId);
    if (installationError !== null) {
      throwStoreError(installationError);
    }

    const { error: repositoryError } = await this.client
      .from("github_repositories")
      .update({
        lifecycle_state: "DISCONNECTED",
        updated_at: updatedAt,
      })
      .eq("installation_id", installationId);
    if (repositoryError !== null) {
      throwStoreError(repositoryError);
    }
  }

  async addInstallationRepositories(
    installationId: number,
    repositories: readonly GitHubRepositoryMetadata[],
  ): Promise<void> {
    if (repositories.length === 0) {
      return;
    }

    const { error } = await this.client
      .from("github_repositories")
      .upsert(
        repositories.map((repository) => repositoryRow(installationId, repository)),
        { onConflict: "repository_id" },
      );
    if (error !== null) {
      throwStoreError(error);
    }
  }

  async removeInstallationRepositories(
    installationId: number,
    repositoryIds: readonly number[],
  ): Promise<void> {
    if (repositoryIds.length === 0) {
      return;
    }

    const { error } = await this.client
      .from("github_repositories")
      .update({
        lifecycle_state: "DISCONNECTED",
        updated_at: new Date().toISOString(),
      })
      .eq("installation_id", installationId)
      .in("repository_id", repositoryIds);
    if (error !== null) {
      throwStoreError(error);
    }
  }

  async syncSetupPullRequestClosed(
    input: SetupPullRequestClosedInput,
  ): Promise<void> {
    const { data, error: lookupError } = await this.client
      .from("github_setup_prs")
      .select("id")
      .eq("repository_id", input.repositoryId)
      .eq("pr_number", input.pullRequestNumber)
      .eq("state", "OPEN")
      .maybeSingle();
    if (lookupError !== null) {
      throwStoreError(lookupError);
    }
    if (data === null) {
      return;
    }

    const now = new Date().toISOString();
    const { error: setupPullRequestError } = await this.client
      .from("github_setup_prs")
      .update({
        state: input.merged ? "MERGED" : "CLOSED",
        ...(input.merged ? { merged_at: now } : { closed_at: now }),
        updated_at: now,
      })
      .eq("id", data.id)
      .eq("state", "OPEN");
    if (setupPullRequestError !== null) {
      throwStoreError(setupPullRequestError);
    }

    const { error: repositoryError } = await this.client
      .from("github_repositories")
      .update({
        lifecycle_state: input.merged ? "CONFIGURED" : "SETUP_REQUIRED",
        updated_at: now,
      })
      .eq("repository_id", input.repositoryId)
      .eq("lifecycle_state", "SETUP_PR_OPEN");
    if (repositoryError !== null) {
      throwStoreError(repositoryError);
    }
  }
}
