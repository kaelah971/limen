import type { IncomingMessage } from "node:http";
import {
  GitHubInstallationClientError,
  SetupConfigError,
  SetupError,
  SetupGitHubError,
  SetupInspectionError,
  SetupPersistenceError,
  GitHubActionsOidcError,
  verifyGitHubActionsOidcToken,
  verifyGitHubWebhookSignature,
} from "../../../packages/github-app/src";
import {
  GitHubAppStoreError,
  GitHubInstallationAlreadyBoundError,
  GitHubInstallationDisconnectedError,
  GitHubInstallationNotConfirmedError,
  GitHubEvaluationPersistenceError,
  GitHubIntegrationHealthPersistenceError,
  GitHubRepositoryStore,
  GitHubSetupPersistenceError,
  type GitHubEvaluationInput,
  type GitHubEvaluationStore,
  type GitHubIntegrationHealthInput,
  type GitHubIntegrationHealthStore,
} from "./github-app-store";
import type {
  GitHubAppStore,
  GitHubInstallationAuthorizationStore,
  GitHubRepositoryMetadata,
  GitHubRepositoryRecord,
  InstallationCreatedInput,
  SetupPullRequestClosedInput,
} from "./github-app-store";
import type { GitHubActionsOidcVerifier } from "../../../packages/github-app/src";
import type {
  SetupGenerationConfig,
  SetupRepository,
  SetupService,
} from "../../../packages/github-app/src";
import {
  authenticateUser,
  UserAuthError,
  type UserAuthClient,
} from "./user-auth";

export const GITHUB_WEBHOOK_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const GITHUB_EVALUATION_MAX_BODY_BYTES = 2 * 1024 * 1024;
export const GITHUB_INTEGRATION_HEALTH_MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface GitHubWebhookRouteOptions {
  secret: string;
  store: GitHubAppStore;
  maxBodyBytes?: number;
}

export interface GitHubWebhookHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface GitHubInstallationBindRouteOptions {
  authClient: UserAuthClient;
  store: GitHubInstallationAuthorizationStore;
}

export interface GitHubInstallationBindHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface GitHubRepositoryRouteOptions {
  authClient: UserAuthClient;
  store: GitHubRepositoryStore;
  setupService: SetupService;
  setupConfig: SetupGenerationConfig;
}

export interface GitHubRepositoryHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface GitHubEvaluationRouteOptions {
  store: GitHubEvaluationStore;
  oidcAudience: string;
  oidcVerifier?: GitHubActionsOidcVerifier;
  maxBodyBytes?: number;
}

export interface GitHubEvaluationHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface GitHubIntegrationHealthRouteOptions {
  store: GitHubIntegrationHealthStore;
  oidcAudience: string;
  oidcVerifier?: GitHubActionsOidcVerifier;
  maxBodyBytes?: number;
}

export interface GitHubIntegrationHealthHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

class GitHubWebhookRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GitHubWebhookRequestError";
    this.status = status;
    this.code = code;
  }
}

class GitHubRepositoryRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GitHubRepositoryRequestError";
    this.status = status;
    this.code = code;
  }
}

class GitHubEvaluationRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GitHubEvaluationRequestError";
    this.status = status;
    this.code = code;
  }
}

class GitHubIntegrationHealthRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "GitHubIntegrationHealthRequestError";
    this.status = status;
    this.code = code;
  }
}

function response(
  status: number,
  body: Record<string, unknown>,
): GitHubWebhookHttpResponse {
  return { status, body };
}

function repositoryIdValue(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new GitHubRepositoryRequestError(
      400,
      "GITHUB_REPOSITORY_ID_INVALID",
      "The GitHub repository ID is invalid.",
    );
  }
  const repositoryId = Number(value);
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
    throw new GitHubRepositoryRequestError(
      400,
      "GITHUB_REPOSITORY_ID_INVALID",
      "The GitHub repository ID is invalid.",
    );
  }
  return repositoryId;
}

function repositoryNotFound(): GitHubRepositoryRequestError {
  return new GitHubRepositoryRequestError(
    404,
    "GITHUB_REPOSITORY_NOT_FOUND",
    "The GitHub repository was not found.",
  );
}

function sanitizedRepository(repository: GitHubRepositoryRecord): Record<string, unknown> {
  return {
    repositoryId: repository.repositoryId,
    owner: repository.ownerLogin,
    name: repository.repositoryName,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    lifecycleState: repository.lifecycleState,
    latestDecision: repository.latestDecision,
    latestEvaluationAt: repository.latestEvaluationAt,
    setupPullRequest: sanitizedSetupPullRequest(repository.setupPullRequest),
  };
}

function sanitizedSetupPullRequest(
  setupPullRequest: GitHubRepositoryRecord["setupPullRequest"],
): Record<string, unknown> | null {
  return setupPullRequest === null
    ? null
    : {
        number: setupPullRequest.prNumber,
        url: setupPullRequest.prUrl,
        state: setupPullRequest.state,
      };
}

function setupRepository(repository: GitHubRepositoryRecord): SetupRepository {
  return {
    installationId: repository.installationId,
    repositoryId: repository.repositoryId,
    owner: repository.ownerLogin,
    name: repository.repositoryName,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
  };
}

async function authorizedRepository(
  repositoryIdValue_: string,
  request: IncomingMessage,
  options: GitHubRepositoryRouteOptions,
): Promise<GitHubRepositoryRecord> {
  const user = await authenticateUser(request, options.authClient, options.store);
  const repositoryId = repositoryIdValue(repositoryIdValue_);
  const repository = await options.store.getAuthorizedRepository(repositoryId, user.authUserId);
  if (repository === null) {
    throw repositoryNotFound();
  }
  return repository;
}

async function requireActionableRepository(
  repositoryIdValue_: string,
  request: IncomingMessage,
  options: GitHubRepositoryRouteOptions,
): Promise<GitHubRepositoryRecord> {
  const repository = await authorizedRepository(repositoryIdValue_, request, options);
  if (repository.lifecycleState === "DISCONNECTED") {
    throw new GitHubInstallationDisconnectedError();
  }
  let state: "ACTIVE" | "DISCONNECTED";
  try {
    state = await options.store.getInstallationState(repository.installationId);
  } catch (error) {
    if (error instanceof GitHubInstallationNotConfirmedError
      || error instanceof GitHubInstallationDisconnectedError) {
      throw error;
    }
    throw new GitHubAppStoreError();
  }
  if (state !== "ACTIVE") {
    throw new GitHubInstallationDisconnectedError();
  }
  return repository;
}

function headerValue(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return typeof value === "string" ? value : undefined;
}

async function readRawBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new GitHubWebhookRequestError(
        413,
        "GITHUB_WEBHOOK_PAYLOAD_TOO_LARGE",
        "GitHub webhook payload is too large.",
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new GitHubWebhookRequestError(
    400,
    "GITHUB_WEBHOOK_INVALID_PAYLOAD",
    "GitHub webhook payload is invalid.",
  );
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GitHubWebhookRequestError(
      400,
      "GITHUB_WEBHOOK_INVALID_PAYLOAD",
      "GitHub webhook payload is invalid.",
    );
  }
  return value.trim();
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new GitHubWebhookRequestError(
      400,
      "GITHUB_WEBHOOK_INVALID_PAYLOAD",
      "GitHub webhook payload is invalid.",
    );
  }
  return value;
}

function optionalAction(payload: Record<string, unknown>): string | undefined {
  return typeof payload.action === "string" ? payload.action : undefined;
}

function repositoryMetadata(value: unknown): GitHubRepositoryMetadata {
  const repository = objectValue(value);
  const fullName = requiredText(repository.full_name);
  const owner = repository.owner === undefined
    ? undefined
    : objectValue(repository.owner);
  const ownerLogin = owner?.login ?? fullName.split("/", 1)[0];
  return {
    repositoryId: positiveInteger(repository.id),
    ownerLogin: requiredText(ownerLogin),
    repositoryName: requiredText(repository.name),
    fullName,
    defaultBranch: requiredText(repository.default_branch),
  };
}

function repositoryList(value: unknown): GitHubRepositoryMetadata[] {
  if (!Array.isArray(value)) {
    throw new GitHubWebhookRequestError(
      400,
      "GITHUB_WEBHOOK_INVALID_PAYLOAD",
      "GitHub webhook payload is invalid.",
    );
  }
  return value.map(repositoryMetadata);
}

function installationId(payload: Record<string, unknown>): number {
  return positiveInteger(objectValue(payload.installation).id);
}

function installationCreatedInput(
  payload: Record<string, unknown>,
): InstallationCreatedInput {
  const installation = objectValue(payload.installation);
  const account = objectValue(installation.account);
  const sender = objectValue(payload.sender);
  const accountType = requiredText(account.type);
  if (accountType !== "User" && accountType !== "Organization") {
    throw new GitHubWebhookRequestError(
      400,
      "GITHUB_WEBHOOK_INVALID_PAYLOAD",
      "GitHub webhook payload is invalid.",
    );
  }
  const repositories = installation.repositories === undefined
    ? (Array.isArray(payload.repositories) ? payload.repositories : [])
    : installation.repositories;
  return {
    installationId: positiveInteger(installation.id),
    accountId: positiveInteger(account.id),
    accountLogin: requiredText(account.login),
    accountType,
    installedByGithubUserId: positiveInteger(sender.id),
    repositories: repositoryList(repositories),
  };
}

function setupPullRequestClosedInput(
  payload: Record<string, unknown>,
): SetupPullRequestClosedInput {
  const pullRequest = objectValue(payload.pull_request);
  const repository = objectValue(payload.repository);
  return {
    repositoryId: positiveInteger(repository.id),
    pullRequestNumber: positiveInteger(payload.number ?? pullRequest.number),
    merged: pullRequest.merged === true,
  };
}

async function processWebhook(
  eventName: string,
  payload: Record<string, unknown>,
  store: GitHubAppStore,
): Promise<boolean> {
  const action = optionalAction(payload);
  if (eventName === "installation") {
    if (action === "created") {
      await store.recordInstallationCreated(installationCreatedInput(payload));
      return true;
    }
    if (action === "deleted") {
      await store.disconnectInstallation(installationId(payload));
      return true;
    }
    return false;
  }

  if (eventName === "installation_repositories") {
    if (action === "added") {
      await store.addInstallationRepositories(
        installationId(payload),
        repositoryList(payload.repositories_added),
      );
      return true;
    }
    if (action === "removed") {
      const repositories = repositoryList(payload.repositories_removed);
      await store.removeInstallationRepositories(
        installationId(payload),
        repositories.map((repository) => repository.repositoryId),
      );
      return true;
    }
    return false;
  }

  if (eventName === "pull_request" && action === "closed") {
    await store.syncSetupPullRequestClosed(setupPullRequestClosedInput(payload));
    return true;
  }

  return false;
}

function bindInstallationId(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new GitHubWebhookRequestError(
      400,
      "GITHUB_INSTALLATION_ID_INVALID",
      "The GitHub installation ID is invalid.",
    );
  }
  const installationId = Number(value);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw new GitHubWebhookRequestError(
      400,
      "GITHUB_INSTALLATION_ID_INVALID",
      "The GitHub installation ID is invalid.",
    );
  }
  return installationId;
}

function installationBindErrorResponse(error: unknown): GitHubInstallationBindHttpResponse {
  if (error instanceof GitHubWebhookRequestError || error instanceof UserAuthError) {
    return response(error.status, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubInstallationNotConfirmedError) {
    return response(409, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubInstallationDisconnectedError) {
    return response(409, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubInstallationAlreadyBoundError) {
    return response(409, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubAppStoreError) {
    return response(500, {
      code: error.code,
      message: "The GitHub installation metadata store is unavailable.",
    });
  }
  return response(500, {
    code: "GITHUB_INSTALLATION_BIND_INTERNAL_ERROR",
    message: "The GitHub installation could not be bound.",
  });
}

export async function handleGitHubInstallationBind(
  request: IncomingMessage,
  installationIdValue: string,
  options: GitHubInstallationBindRouteOptions,
): Promise<GitHubInstallationBindHttpResponse> {
  try {
    const user = await authenticateUser(request, options.authClient, options.store);
    const installationId = bindInstallationId(installationIdValue);
    const installation = await options.store.getInstallation(installationId);
    if (installation === null) {
      throw new GitHubInstallationNotConfirmedError();
    }
    if (installation.connectionState === "DISCONNECTED") {
      throw new GitHubInstallationDisconnectedError();
    }
    if (installation.installedByGithubUserId !== user.githubUserId) {
      return response(403, {
        code: "GITHUB_INSTALLATION_USER_MISMATCH",
        message: "The authenticated GitHub user did not install this GitHub App installation.",
      });
    }
    if (installation.boundByAuthUserId === user.authUserId) {
      return response(200, {
        bound: true,
        alreadyBound: true,
        installationId,
      });
    }
    if (installation.boundByAuthUserId !== null) {
      throw new GitHubInstallationAlreadyBoundError();
    }

    const binding = await options.store.bindInstallation(installationId, user.authUserId);
    return response(200, {
      bound: true,
      ...(binding === "ALREADY_BOUND" ? { alreadyBound: true } : {}),
      installationId,
    });
  } catch (error) {
    return installationBindErrorResponse(error);
  }
}

function repositoryErrorResponse(error: unknown): GitHubRepositoryHttpResponse {
  if (error instanceof GitHubRepositoryRequestError || error instanceof UserAuthError) {
    return response(error.status, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubInstallationNotConfirmedError) {
    return response(409, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubInstallationDisconnectedError) {
    return response(409, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubSetupPersistenceError) {
    if (error.code === "GITHUB_REPOSITORY_NOT_FOUND") {
      return response(404, { code: error.code, message: error.message });
    }
    if (error.code === "GITHUB_REPOSITORY_DISCONNECTED") {
      return response(409, { code: error.code, message: error.message });
    }
    if (error.code === "GITHUB_SETUP_PR_ALREADY_OPEN") {
      return response(409, { code: error.code, message: error.message });
    }
    if (error.code === "GITHUB_SETUP_INPUT_INVALID") {
      return response(400, { code: error.code, message: error.message });
    }
    return response(500, {
      code: error.code,
      message: "The setup pull request could not be recorded.",
    });
  }
  if (error instanceof SetupInspectionError) {
    return response(502, { code: error.code, message: error.message });
  }
  if (error instanceof SetupGitHubError) {
    return response(502, { code: error.code, message: error.message });
  }
  if (error instanceof SetupPersistenceError) {
    return response(500, { code: error.code, message: error.message });
  }
  if (error instanceof SetupConfigError) {
    return response(500, {
      code: error.code,
      message: "The setup generation configuration is invalid.",
    });
  }
  if (error instanceof GitHubInstallationClientError) {
    if (error.code === "GITHUB_INSTALLATION_DISCONNECTED") {
      return response(409, {
        code: "INSTALLATION_DISCONNECTED",
        message: "The GitHub installation is disconnected.",
      });
    }
    return response(502, {
      code: "SETUP_GITHUB_ERROR",
      message: "The setup pull request could not be created on GitHub.",
    });
  }
  if (error instanceof SetupError) {
    return response(502, {
      code: error.code,
      message: "The GitHub repository setup request failed.",
    });
  }
  if (error instanceof GitHubAppStoreError) {
    return response(500, {
      code: error.code,
      message: "The GitHub repository metadata store is unavailable.",
    });
  }
  return response(500, {
    code: "GITHUB_REPOSITORY_API_INTERNAL_ERROR",
    message: "The GitHub repository request failed.",
  });
}

function evaluationRequestError(
  status: number,
  code: string,
  message: string,
): GitHubEvaluationRequestError {
  return new GitHubEvaluationRequestError(status, code, message);
}

function evaluationObjectValue(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_REQUEST", "The GitHub evaluation request is invalid.");
}

function evaluationPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_REQUEST", `The GitHub evaluation field ${field} is invalid.`);
  }
  return value;
}

function evaluationText(value: unknown, field: string, maxLength: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_REQUEST", `The GitHub evaluation field ${field} is invalid.`);
  }
  return value;
}

function evaluationReceiptId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return evaluationText(value, "receiptId", 255);
}

function evaluationTimestamp(value: unknown): string {
  const timestamp = evaluationText(value, "evaluatedAt", 64);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))
  ) {
    throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_REQUEST", "The GitHub evaluation timestamp is invalid.");
  }
  return timestamp;
}

function evaluationInput(value: unknown): GitHubEvaluationInput {
  const body = evaluationObjectValue(value);
  const fields = new Set([
    "repositoryId",
    "githubRunId",
    "githubRunAttempt",
    "workflowRef",
    "commitSha",
    "decision",
    "receiptId",
    "evaluatedAt",
  ]);
  if (Object.keys(body).some((key) => !fields.has(key))) {
    throw evaluationRequestError(
      400,
      "GITHUB_EVALUATION_INVALID_REQUEST",
      "The GitHub evaluation request contains unsupported fields.",
    );
  }

  const commitSha = evaluationText(body.commitSha, "commitSha", 40);
  if (!/^[0-9a-fA-F]{40}$/.test(commitSha)) {
    throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_REQUEST", "The GitHub evaluation commit SHA is invalid.");
  }
  const decision = body.decision;
  if (decision !== "PASS" && decision !== "HOLD" && decision !== "REVIEW") {
    throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_REQUEST", "The GitHub evaluation decision is invalid.");
  }
  return {
    repositoryId: evaluationPositiveInteger(body.repositoryId, "repositoryId"),
    githubRunId: evaluationPositiveInteger(body.githubRunId, "githubRunId"),
    githubRunAttempt: evaluationPositiveInteger(body.githubRunAttempt, "githubRunAttempt"),
    workflowRef: evaluationText(body.workflowRef, "workflowRef", 700),
    commitSha,
    decision,
    receiptId: evaluationReceiptId(body.receiptId),
    evaluatedAt: evaluationTimestamp(body.evaluatedAt),
  };
}

async function readEvaluationBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw evaluationRequestError(413, "GITHUB_EVALUATION_PAYLOAD_TOO_LARGE", "The GitHub evaluation payload is too large.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } catch {
    throw evaluationRequestError(400, "GITHUB_EVALUATION_INVALID_JSON", "The GitHub evaluation payload must be valid JSON.");
  }
}

function evaluationBearerToken(request: IncomingMessage): string {
  const authorization = headerValue(request, "authorization");
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw evaluationRequestError(401, "GITHUB_OIDC_UNAUTHORIZED", "A valid GitHub Actions OIDC token is required.");
  }
  const token = authorization.slice("Bearer ".length);
  if (token.length === 0 || /\s/.test(token)) {
    throw evaluationRequestError(401, "GITHUB_OIDC_UNAUTHORIZED", "A valid GitHub Actions OIDC token is required.");
  }
  return token;
}

interface GitHubIntegrationHealthRequest extends GitHubIntegrationHealthInput {
  githubRunId: number;
  githubRunAttempt: number;
  workflowRef: string;
  code: "CONFIGURATION_INVALID";
}

function healthRequestError(
  status: number,
  code: string,
  message: string,
): GitHubIntegrationHealthRequestError {
  return new GitHubIntegrationHealthRequestError(status, code, message);
}

function healthObjectValue(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw healthRequestError(
    400,
    "GITHUB_INTEGRATION_HEALTH_INVALID_REQUEST",
    "The GitHub integration health request is invalid.",
  );
}

function healthPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw healthRequestError(
      400,
      "GITHUB_INTEGRATION_HEALTH_INVALID_REQUEST",
      `The GitHub integration health field ${field} is invalid.`,
    );
  }
  return value;
}

function healthText(value: unknown, field: string, maxLength: number): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxLength
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw healthRequestError(
      400,
      "GITHUB_INTEGRATION_HEALTH_INVALID_REQUEST",
      `The GitHub integration health field ${field} is invalid.`,
    );
  }
  return value;
}

function healthTimestamp(value: unknown): string {
  const timestamp = healthText(value, "observedAt", 64);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))
  ) {
    throw healthRequestError(
      400,
      "GITHUB_INTEGRATION_HEALTH_INVALID_REQUEST",
      "The GitHub integration health timestamp is invalid.",
    );
  }
  return timestamp;
}

function healthInput(value: unknown): GitHubIntegrationHealthRequest {
  const body = healthObjectValue(value);
  const fields = new Set([
    "repositoryId",
    "githubRunId",
    "githubRunAttempt",
    "workflowRef",
    "code",
    "observedAt",
  ]);
  if (Object.keys(body).some((key) => !fields.has(key))) {
    throw healthRequestError(
      400,
      "GITHUB_INTEGRATION_HEALTH_INVALID_REQUEST",
      "The GitHub integration health request contains unsupported fields.",
    );
  }
  if (body.code !== "CONFIGURATION_INVALID") {
    throw healthRequestError(
      400,
      "GITHUB_INTEGRATION_HEALTH_INVALID_REQUEST",
      "The GitHub integration health code is invalid.",
    );
  }
  return {
    repositoryId: healthPositiveInteger(body.repositoryId, "repositoryId"),
    githubRunId: healthPositiveInteger(body.githubRunId, "githubRunId"),
    githubRunAttempt: healthPositiveInteger(body.githubRunAttempt, "githubRunAttempt"),
    workflowRef: healthText(body.workflowRef, "workflowRef", 700),
    code: "CONFIGURATION_INVALID",
    observedAt: healthTimestamp(body.observedAt),
  };
}

async function readHealthBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw healthRequestError(
        413,
        "GITHUB_INTEGRATION_HEALTH_PAYLOAD_TOO_LARGE",
        "The GitHub integration health payload is too large.",
      );
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8")) as unknown;
  } catch {
    throw healthRequestError(
      400,
      "GITHUB_INTEGRATION_HEALTH_INVALID_JSON",
      "The GitHub integration health payload must be valid JSON.",
    );
  }
}

function healthBearerToken(request: IncomingMessage): string {
  const authorization = headerValue(request, "authorization");
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw healthRequestError(
      401,
      "GITHUB_OIDC_UNAUTHORIZED",
      "A valid GitHub Actions OIDC token is required.",
    );
  }
  const token = authorization.slice("Bearer ".length);
  if (token.length === 0 || /\s/.test(token)) {
    throw healthRequestError(
      401,
      "GITHUB_OIDC_UNAUTHORIZED",
      "A valid GitHub Actions OIDC token is required.",
    );
  }
  return token;
}

function repositoryMatchesIdentity(
  repository: { fullName: string },
  identity: { repository: string },
): boolean {
  return repository.fullName === identity.repository;
}

function evaluationErrorResponse(error: unknown): GitHubEvaluationHttpResponse {
  if (error instanceof GitHubEvaluationRequestError) {
    return response(error.status, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubActionsOidcError) {
    return response(401, {
      code: error.code,
      message: "The GitHub Actions OIDC token is invalid.",
    });
  }
  if (error instanceof GitHubEvaluationPersistenceError) {
    if (error.code === "GITHUB_REPOSITORY_NOT_FOUND") {
      return response(404, { code: error.code, message: error.message });
    }
    if (
      error.code === "GITHUB_INSTALLATION_DISCONNECTED"
      || error.code === "GITHUB_REPOSITORY_DISCONNECTED"
    ) {
      return response(409, { code: error.code, message: error.message });
    }
    if (error.code === "GITHUB_EVALUATION_CONFLICT") {
      return response(409, { code: error.code, message: error.message });
    }
    if (error.code === "GITHUB_EVALUATION_INPUT_INVALID") {
      return response(400, { code: error.code, message: error.message });
    }
    return response(500, {
      code: error.code,
      message: "The GitHub evaluation service is temporarily unavailable.",
    });
  }
  if (error instanceof GitHubAppStoreError) {
    return response(500, {
      code: error.code,
      message: "The GitHub evaluation service is temporarily unavailable.",
    });
  }
  if (
    error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "GITHUB_EVALUATION_CONFLICT"
  ) {
    return response(409, {
      code: "GITHUB_EVALUATION_CONFLICT",
      message: "This GitHub evaluation already exists with different evidence.",
    });
  }
  return response(500, {
    code: "GITHUB_EVALUATION_INTERNAL_ERROR",
    message: "The GitHub evaluation could not be recorded.",
  });
}

export async function handleGitHubEvaluation(
  request: IncomingMessage,
  options: GitHubEvaluationRouteOptions,
): Promise<GitHubEvaluationHttpResponse> {
  try {
    const token = evaluationBearerToken(request);
    const identity = await verifyGitHubActionsOidcToken(
      token,
      options.oidcAudience,
      options.oidcVerifier,
    );
    const input = evaluationInput(
      await readEvaluationBody(request, options.maxBodyBytes ?? GITHUB_EVALUATION_MAX_BODY_BYTES),
    );
    if (
      input.repositoryId !== identity.repositoryId
      || input.githubRunId !== identity.runId
      || input.githubRunAttempt !== identity.runAttempt
      || input.workflowRef !== identity.workflowRef
    ) {
      return response(403, {
        code: "GITHUB_EVALUATION_CLAIM_MISMATCH",
        message: "The GitHub evaluation does not match the OIDC claims.",
      });
    }

    const repository = await options.store.getEvaluationRepository(input.repositoryId);
    if (repository === null) {
      return response(404, {
        code: "GITHUB_REPOSITORY_NOT_FOUND",
        message: "The GitHub repository was not found.",
      });
    }
    if (!repositoryMatchesIdentity(repository, identity)) {
      return response(403, {
        code: "GITHUB_EVALUATION_REPOSITORY_MISMATCH",
        message: "The GitHub OIDC repository does not match the stored repository.",
      });
    }
    if (repository.installationConnectionState !== "ACTIVE") {
      return response(409, {
        code: "GITHUB_INSTALLATION_DISCONNECTED",
        message: "The GitHub installation is disconnected.",
      });
    }
    if (repository.lifecycleState === "DISCONNECTED") {
      return response(409, {
        code: "GITHUB_REPOSITORY_DISCONNECTED",
        message: "The GitHub repository is disconnected.",
      });
    }
    if (
      repository.lifecycleState !== "CONFIGURED"
      && repository.lifecycleState !== "NEEDS_ATTENTION"
      && repository.lifecycleState !== "VERIFIED"
    ) {
      return response(409, {
        code: "GITHUB_REPOSITORY_NOT_READY",
        message: "The GitHub repository is not ready to accept evaluations.",
      });
    }

    const evaluation = await options.store.recordGitHubEvaluation(input);
    return response(200, { accepted: true, evaluation });
  } catch (error) {
    return evaluationErrorResponse(error);
  }
}

function integrationHealthErrorResponse(error: unknown): GitHubIntegrationHealthHttpResponse {
  if (error instanceof GitHubIntegrationHealthRequestError) {
    return response(error.status, { code: error.code, message: error.message });
  }
  if (error instanceof GitHubActionsOidcError) {
    return response(401, {
      code: error.code,
      message: "The GitHub Actions OIDC token is invalid.",
    });
  }
  if (error instanceof GitHubIntegrationHealthPersistenceError) {
    if (error.code === "GITHUB_REPOSITORY_NOT_FOUND") {
      return response(404, { code: error.code, message: error.message });
    }
    if (
      error.code === "GITHUB_INSTALLATION_DISCONNECTED"
      || error.code === "GITHUB_REPOSITORY_DISCONNECTED"
      || error.code === "GITHUB_REPOSITORY_NOT_READY"
    ) {
      return response(409, { code: error.code, message: error.message });
    }
    if (error.code === "GITHUB_INTEGRATION_HEALTH_INPUT_INVALID") {
      return response(400, { code: error.code, message: error.message });
    }
    return response(500, {
      code: error.code,
      message: "The GitHub integration health service is temporarily unavailable.",
    });
  }
  if (error instanceof GitHubAppStoreError) {
    return response(500, {
      code: error.code,
      message: "The GitHub integration health service is temporarily unavailable.",
    });
  }
  return response(500, {
    code: "GITHUB_INTEGRATION_HEALTH_INTERNAL_ERROR",
    message: "The GitHub integration health report could not be recorded.",
  });
}

export async function handleGitHubIntegrationHealth(
  request: IncomingMessage,
  options: GitHubIntegrationHealthRouteOptions,
): Promise<GitHubIntegrationHealthHttpResponse> {
  try {
    const token = healthBearerToken(request);
    const identity = await verifyGitHubActionsOidcToken(
      token,
      options.oidcAudience,
      options.oidcVerifier,
    );
    const input = healthInput(
      await readHealthBody(request, options.maxBodyBytes ?? GITHUB_INTEGRATION_HEALTH_MAX_BODY_BYTES),
    );
    if (
      input.repositoryId !== identity.repositoryId
      || input.githubRunId !== identity.runId
      || input.githubRunAttempt !== identity.runAttempt
      || input.workflowRef !== identity.workflowRef
    ) {
      return response(403, {
        code: "GITHUB_INTEGRATION_HEALTH_CLAIM_MISMATCH",
        message: "The GitHub integration health report does not match the OIDC claims.",
      });
    }

    const repository = await options.store.getEvaluationRepository(input.repositoryId);
    if (repository === null) {
      return response(404, {
        code: "GITHUB_REPOSITORY_NOT_FOUND",
        message: "The GitHub repository was not found.",
      });
    }
    if (!repositoryMatchesIdentity(repository, identity)) {
      return response(403, {
        code: "GITHUB_INTEGRATION_HEALTH_REPOSITORY_MISMATCH",
        message: "The GitHub OIDC repository does not match the stored repository.",
      });
    }
    if (repository.installationConnectionState !== "ACTIVE") {
      return response(409, {
        code: "GITHUB_INSTALLATION_DISCONNECTED",
        message: "The GitHub installation is disconnected.",
      });
    }
    if (repository.lifecycleState === "DISCONNECTED") {
      return response(409, {
        code: "GITHUB_REPOSITORY_DISCONNECTED",
        message: "The GitHub repository is disconnected.",
      });
    }
    if (
      repository.lifecycleState !== "CONFIGURED"
      && repository.lifecycleState !== "VERIFIED"
      && repository.lifecycleState !== "NEEDS_ATTENTION"
    ) {
      return response(409, {
        code: "GITHUB_REPOSITORY_NOT_READY",
        message: "The GitHub repository is not ready to accept integration health reports.",
      });
    }

    await options.store.markRepositoryNeedsAttention({
      repositoryId: input.repositoryId,
      observedAt: input.observedAt,
    });
    return response(200, {
      accepted: true,
      repositoryId: input.repositoryId,
      lifecycleState: "NEEDS_ATTENTION",
    });
  } catch (error) {
    return integrationHealthErrorResponse(error);
  }
}

export async function handleGitHubRepositoryRequest(
  request: IncomingMessage,
  path: readonly string[],
  options: GitHubRepositoryRouteOptions,
): Promise<GitHubRepositoryHttpResponse> {
  try {
    const repositoryPath = path[3];
    if (path.length === 3 && request.method === "GET") {
      const user = await authenticateUser(request, options.authClient, options.store);
      const repositories = await options.store.listAuthorizedRepositories(user.authUserId);
      return response(200, {
        repositories: repositories
          .filter((repository) => repository.lifecycleState !== "DISCONNECTED")
          .map(sanitizedRepository),
      });
    }

    if (path.length !== 4 && path.length !== 5) {
      throw new GitHubRepositoryRequestError(
        404,
        "GITHUB_REPOSITORY_ROUTE_NOT_FOUND",
        "The GitHub repository route was not found.",
      );
    }
    if (repositoryPath === undefined) {
      throw repositoryNotFound();
    }

    if (path.length === 4 && request.method === "GET") {
      const repository = await authorizedRepository(repositoryPath, request, options);
      if (repository.lifecycleState === "DISCONNECTED") {
        throw repositoryNotFound();
      }
      return response(200, sanitizedRepository(repository));
    }

    if (
      path.length === 5
      && (path[4] === "setup-preview" || path[4] === "setup-pr")
      && (request.method === "GET" || request.method === "POST")
    ) {
      const repository = await requireActionableRepository(repositoryPath, request, options);
      const setupRepositoryValue = setupRepository(repository);
      if (path[4] === "setup-preview") {
        if (request.method !== "GET") {
          throw new GitHubRepositoryRequestError(
            404,
            "GITHUB_REPOSITORY_ROUTE_NOT_FOUND",
            "The GitHub repository route was not found.",
          );
        }
        const inspection = await options.setupService.inspectSetup(setupRepositoryValue);
        return response(200, {
          repositoryId: repository.repositoryId,
          ...inspection,
        });
      }

      if (request.method !== "POST") {
        throw new GitHubRepositoryRequestError(
          404,
          "GITHUB_REPOSITORY_ROUTE_NOT_FOUND",
          "The GitHub repository route was not found.",
        );
      }
      const result = await options.setupService.createSetupPullRequest(
        setupRepositoryValue,
        options.setupConfig,
      );
      if (result.code === "ALREADY_CONFIGURED_FILES_PRESENT") {
        return response(409, {
          repositoryId: repository.repositoryId,
          ...result,
        });
      }
      return response(200, {
        repositoryId: repository.repositoryId,
        code: result.code,
        setupPullRequest: sanitizedSetupPullRequest(result.setupPullRequest),
      });
    }

    throw new GitHubRepositoryRequestError(
      404,
      "GITHUB_REPOSITORY_ROUTE_NOT_FOUND",
      "The GitHub repository route was not found.",
    );
  } catch (error) {
    return repositoryErrorResponse(error);
  }
}

export async function handleGitHubWebhook(
  request: IncomingMessage,
  options: GitHubWebhookRouteOptions,
): Promise<GitHubWebhookHttpResponse> {
  try {
    const rawBody = await readRawBody(
      request,
      options.maxBodyBytes ?? GITHUB_WEBHOOK_MAX_BODY_BYTES,
    );
    const signature = headerValue(request, "x-hub-signature-256");
    if (signature === undefined) {
      return response(400, {
        code: "GITHUB_WEBHOOK_SIGNATURE_REQUIRED",
        message: "GitHub webhook signature is required.",
      });
    }

    const deliveryId = headerValue(request, "x-github-delivery")?.trim();
    if (deliveryId === undefined || deliveryId === "") {
      return response(400, {
        code: "GITHUB_WEBHOOK_DELIVERY_REQUIRED",
        message: "GitHub webhook delivery ID is required.",
      });
    }

    const eventName = headerValue(request, "x-github-event")?.trim();
    if (eventName === undefined || eventName === "") {
      return response(400, {
        code: "GITHUB_WEBHOOK_EVENT_REQUIRED",
        message: "GitHub webhook event is required.",
      });
    }

    if (!verifyGitHubWebhookSignature(rawBody, signature, options.secret)) {
      return response(401, {
        code: "GITHUB_WEBHOOK_INVALID_SIGNATURE",
        message: "GitHub webhook signature is invalid.",
      });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    } catch {
      return response(400, {
        code: "GITHUB_WEBHOOK_INVALID_JSON",
        message: "GitHub webhook payload must be valid JSON.",
      });
    }
    const payloadRecord = objectValue(payload);
    const claim = await options.store.claimDelivery(deliveryId, eventName);
    if (claim.duplicate) {
      return response(202, {
        code: "DUPLICATE_DELIVERY",
        message: "GitHub webhook delivery was already processed.",
        duplicate: true,
      });
    }

    const handled = await processWebhook(eventName, payloadRecord, options.store);
    return response(handled ? 200 : 202, {
      accepted: true,
      deliveryId,
      event: eventName,
      handled,
    });
  } catch (error) {
    if (error instanceof GitHubWebhookRequestError) {
      return response(error.status, {
        code: error.code,
        message: error.message,
      });
    }
    return response(500, {
      code: "GITHUB_WEBHOOK_INTERNAL_ERROR",
      message: "The GitHub webhook could not be processed.",
    });
  }
}
