import type { IncomingMessage } from "node:http";
import {
  verifyGitHubWebhookSignature,
} from "../../../packages/github-app/src";
import {
  GitHubAppStoreError,
  GitHubInstallationAlreadyBoundError,
  GitHubInstallationDisconnectedError,
  GitHubInstallationNotConfirmedError,
} from "./github-app-store";
import type {
  GitHubAppStore,
  GitHubInstallationAuthorizationStore,
  GitHubRepositoryMetadata,
  InstallationCreatedInput,
  SetupPullRequestClosedInput,
} from "./github-app-store";
import {
  authenticateUser,
  UserAuthError,
  type UserAuthClient,
} from "./user-auth";

export const GITHUB_WEBHOOK_MAX_BODY_BYTES = 2 * 1024 * 1024;

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

function response(
  status: number,
  body: Record<string, unknown>,
): GitHubWebhookHttpResponse {
  return { status, body };
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
