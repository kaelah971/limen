import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LimenReleaseDecision,
  RepositoryLifecycleState,
} from "../../../packages/github-app/src";
import type {
  SetupPersistence,
  SetupPullRequestRecord,
} from "../../../packages/github-app/src";

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

export interface GitHubRepositoryRecord {
  repositoryId: number;
  installationId: number;
  ownerLogin: string;
  repositoryName: string;
  fullName: string;
  defaultBranch: string;
  lifecycleState: RepositoryLifecycleState;
  latestDecision: LimenReleaseDecision | null;
  latestEvaluationAt: string | null;
  setupPullRequest: SetupPullRequestRecord | null;
}

export interface GitHubRepositoryStore extends GitHubInstallationAuthorizationStore, SetupPersistence {
  listAuthorizedRepositories(authUserId: string): Promise<GitHubRepositoryRecord[]>;
  getAuthorizedRepository(
    repositoryId: number,
    authUserId: string,
  ): Promise<GitHubRepositoryRecord | null>;
  getInstallationState(
    installationId: number,
  ): Promise<"ACTIVE" | "DISCONNECTED">;
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

export type GitHubSetupPersistenceErrorCode =
  | "GITHUB_REPOSITORY_NOT_FOUND"
  | "GITHUB_REPOSITORY_DISCONNECTED"
  | "GITHUB_SETUP_PR_ALREADY_OPEN"
  | "GITHUB_SETUP_INPUT_INVALID"
  | "GITHUB_SETUP_PERSISTENCE_ERROR";

export class GitHubSetupPersistenceError extends Error {
  readonly code: GitHubSetupPersistenceErrorCode;

  constructor(code: GitHubSetupPersistenceErrorCode, message: string) {
    super(message);
    this.name = "GitHubSetupPersistenceError";
    this.code = code;
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

function objectRow(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function requiredRowText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text === "" ? null : text;
}

function repositoryLifecycleState(value: unknown): RepositoryLifecycleState | null {
  return value === "SETUP_REQUIRED"
    || value === "SETUP_PR_OPEN"
    || value === "CONFIGURED"
    || value === "VERIFIED"
    || value === "NEEDS_ATTENTION"
    || value === "DISCONNECTED"
    ? value
    : null;
}

function releaseDecision(value: unknown): LimenReleaseDecision | null {
  return value === null || value === undefined
    ? null
    : value === "PASS" || value === "HOLD" || value === "REVIEW"
      ? value
      : null;
}

function setupPullRequestRow(
  value: unknown,
  repositoryId: number,
): SetupPullRequestRecord {
  const row = objectRow(value);
  const prNumber = numericValue(row.pr_number);
  const prUrl = requiredRowText(row.pr_url);
  const branchName = requiredRowText(row.branch_name);
  if (
    numericValue(row.repository_id) !== repositoryId
    || prNumber === null
    || prNumber <= 0
    || prUrl === null
    || branchName === null
    || row.state !== "OPEN"
  ) {
    throw new GitHubAppStoreError();
  }
  return {
    repositoryId,
    prNumber,
    prUrl,
    branchName,
    state: "OPEN",
  };
}

function repositoryRecord(value: unknown): GitHubRepositoryRecord {
  const row = objectRow(value);
  const repositoryId = numericValue(row.repository_id);
  const installationId = numericValue(row.installation_id);
  const ownerLogin = requiredRowText(row.owner_login);
  const repositoryName = requiredRowText(row.repository_name);
  const fullName = requiredRowText(row.full_name);
  const defaultBranch = requiredRowText(row.default_branch);
  const lifecycleState = repositoryLifecycleState(row.lifecycle_state);
  const latestDecision = releaseDecision(row.latest_decision);
  const latestEvaluationAt = row.latest_evaluation_at === null || row.latest_evaluation_at === undefined
    ? null
    : requiredRowText(row.latest_evaluation_at);
  if (
    repositoryId === null
    || repositoryId <= 0
    || installationId === null
    || installationId <= 0
    || ownerLogin === null
    || repositoryName === null
    || fullName === null
    || defaultBranch === null
    || lifecycleState === null
    || (row.latest_decision !== null && row.latest_decision !== undefined && latestDecision === null)
    || (row.latest_evaluation_at !== null && row.latest_evaluation_at !== undefined && latestEvaluationAt === null)
  ) {
    throw new GitHubAppStoreError();
  }
  return {
    repositoryId,
    installationId,
    ownerLogin,
    repositoryName,
    fullName,
    defaultBranch,
    lifecycleState,
    latestDecision,
    latestEvaluationAt,
    setupPullRequest: null,
  };
}

function mapSetupPersistenceError(error: unknown): GitHubSetupPersistenceError {
  const row = objectRow(error);
  const code = typeof row.code === "string" ? row.code : "";
  const message = typeof row.message === "string" ? row.message : "";
  if (message === "GITHUB_REPOSITORY_NOT_FOUND" || code === "P0002") {
    return new GitHubSetupPersistenceError(
      "GITHUB_REPOSITORY_NOT_FOUND",
      "The GitHub repository was not found.",
    );
  }
  if (message === "GITHUB_REPOSITORY_DISCONNECTED" || code === "P0003") {
    return new GitHubSetupPersistenceError(
      "GITHUB_REPOSITORY_DISCONNECTED",
      "The GitHub repository is disconnected.",
    );
  }
  if (message === "GITHUB_SETUP_PR_ALREADY_OPEN" || code === "P0004") {
    return new GitHubSetupPersistenceError(
      "GITHUB_SETUP_PR_ALREADY_OPEN",
      "The repository already has an open setup pull request.",
    );
  }
  if (message === "GITHUB_SETUP_INPUT_INVALID" || code === "22023") {
    return new GitHubSetupPersistenceError(
      "GITHUB_SETUP_INPUT_INVALID",
      "The setup pull request input is invalid.",
    );
  }
  return new GitHubSetupPersistenceError(
    "GITHUB_SETUP_PERSISTENCE_ERROR",
    "The setup pull request could not be recorded.",
  );
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

  private async openSetupPullRequests(
    repositoryIds: readonly number[],
  ): Promise<Map<number, SetupPullRequestRecord>> {
    if (repositoryIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client
      .from("github_setup_prs")
      .select("repository_id, pr_number, pr_url, branch_name, state")
      .in("repository_id", repositoryIds)
      .eq("state", "OPEN");
    if (error !== null) {
      throwStoreError(error);
    }
    if (!Array.isArray(data)) {
      throw new GitHubAppStoreError();
    }

    const result = new Map<number, SetupPullRequestRecord>();
    for (const row of data) {
      const repositoryId = numericValue(objectRow(row).repository_id);
      if (repositoryId === null || result.has(repositoryId)) {
        throw new GitHubAppStoreError();
      }
      result.set(repositoryId, setupPullRequestRow(row, repositoryId));
    }
    return result;
  }

  async listAuthorizedRepositories(authUserId: string): Promise<GitHubRepositoryRecord[]> {
    const { data, error } = await this.client
      .from("github_repositories")
      .select(
        "repository_id, installation_id, owner_login, repository_name, full_name, default_branch, lifecycle_state, latest_decision, latest_evaluation_at, github_installations!inner(installation_id)",
      )
      .eq("github_installations.bound_by_auth_user_id", authUserId)
      .eq("github_installations.connection_state", "ACTIVE")
      .neq("lifecycle_state", "DISCONNECTED")
      .order("repository_id", { ascending: true });
    if (error !== null) {
      throwStoreError(error);
    }
    if (!Array.isArray(data)) {
      throw new GitHubAppStoreError();
    }

    const repositories = data.map(repositoryRecord);
    const setupPullRequests = await this.openSetupPullRequests(
      repositories.map((repository) => repository.repositoryId),
    );
    return repositories.map((repository) => ({
      ...repository,
      setupPullRequest: setupPullRequests.get(repository.repositoryId) ?? null,
    }));
  }

  async getAuthorizedRepository(
    repositoryId: number,
    authUserId: string,
  ): Promise<GitHubRepositoryRecord | null> {
    const { data, error } = await this.client
      .from("github_repositories")
      .select(
        "repository_id, installation_id, owner_login, repository_name, full_name, default_branch, lifecycle_state, latest_decision, latest_evaluation_at, github_installations!inner(installation_id)",
      )
      .eq("repository_id", repositoryId)
      .eq("github_installations.bound_by_auth_user_id", authUserId)
      .eq("github_installations.connection_state", "ACTIVE")
      .neq("lifecycle_state", "DISCONNECTED")
      .maybeSingle();
    if (error !== null) {
      throwStoreError(error);
    }
    if (data === null) {
      return null;
    }

    const repository = repositoryRecord(data);
    return {
      ...repository,
      setupPullRequest: await this.getOpenSetupPullRequest(repository.repositoryId),
    };
  }

  async getInstallationState(
    installationId: number,
  ): Promise<"ACTIVE" | "DISCONNECTED"> {
    const { data, error } = await this.client
      .from("github_installations")
      .select("connection_state")
      .eq("installation_id", installationId)
      .maybeSingle();
    if (error !== null) {
      throwStoreError(error);
    }
    if (data === null) {
      throw new GitHubInstallationNotConfirmedError();
    }
    const state = objectRow(data).connection_state;
    if (state !== "ACTIVE" && state !== "DISCONNECTED") {
      throw new GitHubAppStoreError();
    }
    return state;
  }

  async getOpenSetupPullRequest(
    repositoryId: number,
  ): Promise<SetupPullRequestRecord | null> {
    const { data, error } = await this.client
      .from("github_setup_prs")
      .select("repository_id, pr_number, pr_url, branch_name, state")
      .eq("repository_id", repositoryId)
      .eq("state", "OPEN")
      .maybeSingle();
    if (error !== null) {
      throwStoreError(error);
    }
    return data === null ? null : setupPullRequestRow(data, repositoryId);
  }

  async recordSetupPullRequestAndTransition(input: {
    repositoryId: number;
    prNumber: number;
    prUrl: string;
    branchName: string;
  }): Promise<SetupPullRequestRecord> {
    const prUrl = input.prUrl.trim();
    const branchName = input.branchName.trim();
    if (
      !Number.isSafeInteger(input.repositoryId)
      || input.repositoryId <= 0
      || !Number.isSafeInteger(input.prNumber)
      || input.prNumber <= 0
      || input.prNumber > 2_147_483_647
      || prUrl === ""
      || prUrl.length > 2048
      || !prUrl.startsWith("https://")
      || branchName === ""
      || branchName.length > 255
    ) {
      throw new GitHubSetupPersistenceError(
        "GITHUB_SETUP_INPUT_INVALID",
        "The setup pull request input is invalid.",
      );
    }

    let result: { data: unknown; error: unknown };
    try {
      result = await this.client.rpc("record_github_setup_pr_and_transition", {
        p_repository_id: input.repositoryId,
        p_pr_number: input.prNumber,
        p_pr_url: prUrl,
        p_branch_name: branchName,
      });
    } catch (error) {
      throw mapSetupPersistenceError(error);
    }
    if (result.error !== null) {
      throw mapSetupPersistenceError(result.error);
    }
    try {
      return setupPullRequestRow(result.data, input.repositoryId);
    } catch {
      throw new GitHubSetupPersistenceError(
        "GITHUB_SETUP_PERSISTENCE_ERROR",
        "The setup pull request could not be recorded.",
      );
    }
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
