import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  createObservabilityLogger,
  startObservabilityStage,
  type LimenObservabilityLogger,
} from "../../../packages/core/src";
import {
  LedgerValidationError,
  isLedgerRunId,
  validateLedgerRunIngest,
} from "../../../packages/ledger/src";
import {
  ReceiptIdParamSchema,
  ReceiptPublicationRequestSchema,
  hashReceiptSnapshot,
  projectReceiptSnapshot,
} from "../../../packages/receipts/src";
import type {
  EvidenceLedger,
  PersistedRun,
  PersistedRunDetail,
} from "../../../packages/ledger/src";
import type { EvidenceReceiptStore } from "../../../packages/receipts/src";
import {
  LedgerConflictError,
  LedgerPersistenceError,
} from "./repository";
import {
  ReceiptConflictError,
  ReceiptNotFoundError,
  ReceiptPersistenceError,
  ReceiptRevokedError,
} from "./receipt-repository";
import {
  handleGitHubInstallationBind,
  handleGitHubEvaluation,
  handleGitHubIntegrationHealth,
  handleGitHubRepositoryRequest,
  handleGitHubWebhook,
  type GitHubInstallationBindRouteOptions,
  type GitHubEvaluationRouteOptions,
  type GitHubIntegrationHealthRouteOptions,
  type GitHubRepositoryRouteOptions,
  type GitHubWebhookRouteOptions,
} from "./github-app-routes";

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface LedgerServerOptions {
  ledger: EvidenceLedger;
  ingestToken: string;
  receipts?: EvidenceReceiptStore;
  githubWebhook?: GitHubWebhookRouteOptions;
  githubInstallationBind?: GitHubInstallationBindRouteOptions;
  githubEvaluationApi?: GitHubEvaluationRouteOptions;
  githubIntegrationHealthApi?: GitHubIntegrationHealthRouteOptions;
  githubRepositoryApi?: GitHubRepositoryRouteOptions;
  maxBodyBytes?: number;
  observability?: LimenObservabilityLogger;
  requestIdFactory?: () => string;
}

class LedgerApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "LedgerApiRequestError";
    this.status = status;
    this.code = code;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const serialized = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(serialized);
}

function handleUnhandledRequestError(response: ServerResponse): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  try {
    sendJson(response, 500, {
      code: "LEDGER_INTERNAL_ERROR",
      message: "The evidence ledger request failed.",
    });
  } catch {
    response.destroy();
  }
}

function routeTemplate(request: IncomingMessage): string {
  try {
    const path = requestPath(request);
    if (path[0] !== "v1") {
      return "unknown";
    }
    if (path[1] === "ledger" && path[2] === "runs") {
      return path.length === 3 ? "/v1/ledger/runs" : "/v1/ledger/runs/:id";
    }
    if (path[1] === "receipts") {
      if (path.length === 2) {
        return "/v1/receipts";
      }
      if (path.length === 3) {
        return "/v1/receipts/:id";
      }
      if (path.length === 4 && path[3] === "revoke") {
        return "/v1/receipts/:id/revoke";
      }
    }
    if (path[1] === "github" && path[2] === "webhooks" && path.length === 3) {
      return "/v1/github/webhooks";
    }
    if (path[1] === "github" && path[2] === "evaluations" && path.length === 3) {
      return "/v1/github/evaluations";
    }
    if (path[1] === "github" && path[2] === "integration-health" && path.length === 3) {
      return "/v1/github/integration-health";
    }
    if (
      path[1] === "github"
      && path[2] === "installations"
      && path.length === 5
      && path[4] === "bind"
    ) {
      return "/v1/github/installations/:installationId/bind";
    }
    if (path[1] === "github" && path[2] === "repositories") {
      if (path.length === 3) {
        return "/v1/github/repositories";
      }
      if (path.length === 4) {
        return "/v1/github/repositories/:repositoryId";
      }
      if (path.length === 5 && path[4] === "setup-preview") {
        return "/v1/github/repositories/:repositoryId/setup-preview";
      }
      if (path.length === 5 && path[4] === "setup-pr") {
        return "/v1/github/repositories/:repositoryId/setup-pr";
      }
    }
    return "unknown";
  } catch {
    return "invalid-path";
  }
}

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) {
    return false;
  }
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function authorize(
  request: IncomingMessage,
  expectedToken: string,
  errorCode = "LEDGER_UNAUTHORIZED",
): void {
  const header = request.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined;
  if (!tokenMatches(token, expectedToken)) {
    throw new LedgerApiRequestError(401, errorCode, "A valid ledger token is required.");
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new LedgerApiRequestError(413, "LEDGER_PAYLOAD_TOO_LARGE", "Ledger payload is too large.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new LedgerApiRequestError(400, "LEDGER_INVALID_JSON", "Ledger payload must be valid JSON.");
  }
}

function requestPath(request: IncomingMessage): string[] {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    throw new LedgerApiRequestError(400, "LEDGER_INVALID_PATH", "Ledger request path is invalid.");
  }
  return url.pathname.split("/").filter(Boolean);
}

async function persistRun(
  request: IncomingMessage,
  options: LedgerServerOptions,
): Promise<PersistedRun> {
  authorize(request, options.ingestToken);
  const input = validateLedgerRunIngest(
    await readJsonBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES),
  );
  return options.ledger.persistRun(input);
}

async function retrieveRun(
  request: IncomingMessage,
  options: LedgerServerOptions,
  id: string,
): Promise<PersistedRunDetail> {
  authorize(request, options.ingestToken);
  if (!isLedgerRunId(id)) {
    throw new LedgerApiRequestError(400, "LEDGER_INVALID_RUN_ID", "Ledger run ID is invalid.");
  }
  const result = await options.ledger.getRun(id);
  if (result === null) {
    throw new LedgerApiRequestError(404, "LEDGER_RUN_NOT_FOUND", "Ledger run was not found.");
  }
  return result;
}

async function publishReceipt(
  request: IncomingMessage,
  options: LedgerServerOptions,
): Promise<unknown> {
  authorize(request, options.ingestToken, "RECEIPT_UNAUTHORIZED");
  if (options.receipts === undefined) {
    throw new LedgerApiRequestError(503, "RECEIPTS_NOT_CONFIGURED", "Evidence receipts are not configured.");
  }
  const parsed = ReceiptPublicationRequestSchema.safeParse(
    await readJsonBody(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES),
  );
  if (!parsed.success) {
    throw new LedgerApiRequestError(400, "RECEIPT_INVALID_REQUEST", "Receipt publication request is invalid.");
  }
  const run = await options.ledger.getRun(parsed.data.runId);
  if (run === null) {
    throw new LedgerApiRequestError(404, "RECEIPT_RUN_NOT_FOUND", "The ledger run was not found.");
  }
  const snapshot = projectReceiptSnapshot(run);
  return options.receipts.publishReceipt({
    runId: parsed.data.runId,
    snapshot,
    snapshotHash: hashReceiptSnapshot(snapshot),
  });
}

async function retrieveReceipt(
  options: LedgerServerOptions,
  id: string,
): Promise<unknown> {
  if (options.receipts === undefined) {
    throw new LedgerApiRequestError(503, "RECEIPTS_NOT_CONFIGURED", "Evidence receipts are not configured.");
  }
  if (!ReceiptIdParamSchema.safeParse(id).success) {
    throw new LedgerApiRequestError(400, "RECEIPT_INVALID_ID", "Receipt ID is invalid.");
  }
  const result = await options.receipts.getReceipt(id);
  if (result === null) {
    throw new LedgerApiRequestError(404, "RECEIPT_NOT_FOUND", "The receipt was not found.");
  }
  if (result.status === "revoked") {
    throw new LedgerApiRequestError(410, "RECEIPT_REVOKED", "The receipt has been revoked.");
  }
  return result.receipt;
}

async function revokeReceipt(
  request: IncomingMessage,
  options: LedgerServerOptions,
  id: string,
): Promise<unknown> {
  authorize(request, options.ingestToken, "RECEIPT_UNAUTHORIZED");
  if (options.receipts === undefined) {
    throw new LedgerApiRequestError(503, "RECEIPTS_NOT_CONFIGURED", "Evidence receipts are not configured.");
  }
  if (!ReceiptIdParamSchema.safeParse(id).success) {
    throw new LedgerApiRequestError(400, "RECEIPT_INVALID_ID", "Receipt ID is invalid.");
  }
  return options.receipts.revokeReceipt(id);
}

interface ApiErrorResponse {
  status: number;
  code: string;
  message: string;
}

function apiErrorResponse(error: unknown): ApiErrorResponse {
  if (error instanceof LedgerApiRequestError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof LedgerValidationError) {
    return { status: 400, code: error.code, message: error.message };
  }
  if (error instanceof LedgerConflictError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof LedgerPersistenceError) {
    return {
      status: 500,
      code: error.code,
      message: "The evidence ledger is temporarily unavailable.",
    };
  }
  if (error instanceof ReceiptConflictError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof ReceiptRevokedError) {
    return { status: 409, code: error.code, message: error.message };
  }
  if (error instanceof ReceiptNotFoundError) {
    return { status: 404, code: error.code, message: "The receipt was not found." };
  }
  if (error instanceof ReceiptPersistenceError) {
    return {
      status: 500,
      code: error.code,
      message: "The evidence receipt service is temporarily unavailable.",
    };
  }
  return {
    status: 500,
    code: "LEDGER_INTERNAL_ERROR",
    message: "The evidence ledger request failed.",
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LedgerServerOptions,
): Promise<void> {
  const requestId = options.requestIdFactory?.() ?? `LM-REQ-${randomUUID()}`;
  const route = routeTemplate(request);
  response.setHeader("x-request-id", requestId);
  const requestStage = startObservabilityStage(
    options.observability,
    "api-request",
    {},
    () => new Date(),
    {
      requestId,
      ...(request.method === undefined ? {} : { method: request.method }),
      route,
    },
  );
  try {
    const path = requestPath(request);
    if (request.method === "POST" && path.length === 3 && path[0] === "v1" && path[1] === "ledger" && path[2] === "runs") {
      sendJson(response, 200, await persistRun(request, options));
      requestStage.success({ httpStatus: 200 });
      return;
    }
    if (request.method === "GET" && path.length === 4 && path[0] === "v1" && path[1] === "ledger" && path[2] === "runs") {
      sendJson(response, 200, await retrieveRun(request, options, path[3] ?? ""));
      requestStage.success({ httpStatus: 200 });
      return;
    }
    if (request.method === "POST" && path.length === 2 && path[0] === "v1" && path[1] === "receipts") {
      sendJson(response, 200, await publishReceipt(request, options));
      requestStage.success({ httpStatus: 200 });
      return;
    }
    if (request.method === "GET" && path.length === 3 && path[0] === "v1" && path[1] === "receipts") {
      sendJson(response, 200, await retrieveReceipt(options, path[2] ?? ""));
      requestStage.success({ httpStatus: 200 });
      return;
    }
    if (request.method === "POST" && path.length === 4 && path[0] === "v1" && path[1] === "receipts" && path[3] === "revoke") {
      sendJson(response, 200, await revokeReceipt(request, options, path[2] ?? ""));
      requestStage.success({ httpStatus: 200 });
      return;
    }
    if (request.method === "POST" && path.length === 3 && path[0] === "v1" && path[1] === "github" && path[2] === "webhooks") {
      if (options.githubWebhook === undefined) {
        throw new LedgerApiRequestError(
          503,
          "GITHUB_WEBHOOK_NOT_CONFIGURED",
          "GitHub webhook processing is not configured.",
        );
      }
      const webhookResponse = await handleGitHubWebhook(request, options.githubWebhook);
      sendJson(response, webhookResponse.status, webhookResponse.body);
      if (webhookResponse.status >= 400) {
        requestStage.failure(undefined, {
          httpStatus: webhookResponse.status,
          errorCode: String(webhookResponse.body.code ?? "GITHUB_WEBHOOK_ERROR"),
        });
      } else {
        requestStage.success({ httpStatus: webhookResponse.status });
      }
      return;
    }
    if (request.method === "POST" && path.length === 3 && path[0] === "v1" && path[1] === "github" && path[2] === "evaluations") {
      if (options.githubEvaluationApi === undefined) {
        throw new LedgerApiRequestError(
          503,
          "GITHUB_EVALUATION_API_NOT_CONFIGURED",
          "GitHub evaluation processing is not configured.",
        );
      }
      const evaluationResponse = await handleGitHubEvaluation(request, options.githubEvaluationApi);
      sendJson(response, evaluationResponse.status, evaluationResponse.body);
      if (evaluationResponse.status >= 400) {
        requestStage.failure(undefined, {
          httpStatus: evaluationResponse.status,
          errorCode: String(evaluationResponse.body.code ?? "GITHUB_EVALUATION_ERROR"),
        });
      } else {
        requestStage.success({ httpStatus: evaluationResponse.status });
      }
      return;
    }
    if (request.method === "POST" && path.length === 3 && path[0] === "v1" && path[1] === "github" && path[2] === "integration-health") {
      if (options.githubIntegrationHealthApi === undefined) {
        throw new LedgerApiRequestError(
          503,
          "GITHUB_INTEGRATION_HEALTH_NOT_CONFIGURED",
          "GitHub integration health processing is not configured.",
        );
      }
      const healthResponse = await handleGitHubIntegrationHealth(request, options.githubIntegrationHealthApi);
      sendJson(response, healthResponse.status, healthResponse.body);
      if (healthResponse.status >= 400) {
        requestStage.failure(undefined, {
          httpStatus: healthResponse.status,
          errorCode: String(healthResponse.body.code ?? "GITHUB_INTEGRATION_HEALTH_ERROR"),
        });
      } else {
        requestStage.success({ httpStatus: healthResponse.status });
      }
      return;
    }
    if (
      request.method === "POST"
      && path.length === 5
      && path[0] === "v1"
      && path[1] === "github"
      && path[2] === "installations"
      && path[4] === "bind"
    ) {
      if (options.githubInstallationBind === undefined) {
        throw new LedgerApiRequestError(
          503,
          "GITHUB_INSTALLATION_BIND_NOT_CONFIGURED",
          "GitHub installation binding is not configured.",
        );
      }
      const bindResponse = await handleGitHubInstallationBind(
        request,
        path[3] ?? "",
        options.githubInstallationBind,
      );
      sendJson(response, bindResponse.status, bindResponse.body);
      if (bindResponse.status >= 400) {
        requestStage.failure(undefined, {
          httpStatus: bindResponse.status,
          errorCode: String(bindResponse.body.code ?? "GITHUB_INSTALLATION_BIND_ERROR"),
        });
      } else {
        requestStage.success({ httpStatus: bindResponse.status });
      }
      return;
    }
    if (
      path[0] === "v1"
      && path[1] === "github"
      && path[2] === "repositories"
      && (
        path.length === 3
        || path.length === 4
        || (path.length === 5 && (path[4] === "setup-preview" || path[4] === "setup-pr"))
      )
    ) {
      if (options.githubRepositoryApi === undefined) {
        throw new LedgerApiRequestError(
          503,
          "GITHUB_REPOSITORY_API_NOT_CONFIGURED",
          "GitHub repository APIs are not configured.",
        );
      }
      const repositoryResponse = await handleGitHubRepositoryRequest(
        request,
        path,
        options.githubRepositoryApi,
      );
      sendJson(response, repositoryResponse.status, repositoryResponse.body);
      if (repositoryResponse.status >= 400) {
        requestStage.failure(undefined, {
          httpStatus: repositoryResponse.status,
          errorCode: String(repositoryResponse.body.code ?? "GITHUB_REPOSITORY_API_ERROR"),
        });
      } else {
        requestStage.success({ httpStatus: repositoryResponse.status });
      }
      return;
    }
    throw new LedgerApiRequestError(404, "LEDGER_ROUTE_NOT_FOUND", "Ledger route was not found.");
  } catch (error) {
    const mapped = apiErrorResponse(error);
    sendJson(response, mapped.status, { code: mapped.code, message: mapped.message });
    requestStage.failure(undefined, {
      httpStatus: mapped.status,
      errorCode: mapped.code,
    });
  }
}

export function createLedgerServer(options: LedgerServerOptions): Server {
  if (options.ingestToken.trim() === "") {
    throw new Error("A ledger ingest token is required to create the server.");
  }
  const resolvedOptions: LedgerServerOptions = {
    ...options,
    observability: options.observability ?? createObservabilityLogger({
      info: (message) => console.log(message),
      warning: (message) => console.warn(message),
      error: (message) => console.error(message),
    }),
  };
  return createServer((request, response) => {
    void handleRequest(request, response, resolvedOptions).catch(() => {
      handleUnhandledRequestError(response);
    });
  });
}
