import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  LedgerValidationError,
  isLedgerRunId,
  validateLedgerRunIngest,
} from "../../../packages/ledger/src";
import type {
  EvidenceLedger,
  PersistedRun,
  PersistedRunDetail,
} from "../../../packages/ledger/src";
import { LedgerPersistenceError } from "./repository";

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface LedgerServerOptions {
  ledger: EvidenceLedger;
  ingestToken: string;
  maxBodyBytes?: number;
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

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) {
    return false;
  }
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function authorize(request: IncomingMessage, expectedToken: string): void {
  const header = request.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined;
  if (!tokenMatches(token, expectedToken)) {
    throw new LedgerApiRequestError(401, "LEDGER_UNAUTHORIZED", "A valid ledger token is required.");
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

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LedgerServerOptions,
): Promise<void> {
  try {
    const path = requestPath(request);
    if (request.method === "POST" && path.length === 3 && path[0] === "v1" && path[1] === "ledger" && path[2] === "runs") {
      sendJson(response, 200, await persistRun(request, options));
      return;
    }
    if (request.method === "GET" && path.length === 4 && path[0] === "v1" && path[1] === "ledger" && path[2] === "runs") {
      sendJson(response, 200, await retrieveRun(request, options, path[3] ?? ""));
      return;
    }
    throw new LedgerApiRequestError(404, "LEDGER_ROUTE_NOT_FOUND", "Ledger route was not found.");
  } catch (error) {
    if (error instanceof LedgerApiRequestError) {
      sendJson(response, error.status, { code: error.code, message: error.message });
      return;
    }
    if (error instanceof LedgerValidationError) {
      sendJson(response, 400, { code: error.code, message: error.message });
      return;
    }
    if (error instanceof LedgerPersistenceError) {
      sendJson(response, 500, { code: error.code, message: "The evidence ledger is temporarily unavailable." });
      return;
    }
    sendJson(response, 500, { code: "LEDGER_INTERNAL_ERROR", message: "The evidence ledger request failed." });
  }
}

export function createLedgerServer(options: LedgerServerOptions): Server {
  if (options.ingestToken.trim() === "") {
    throw new Error("A ledger ingest token is required to create the server.");
  }
  return createServer((request, response) => {
    void handleRequest(request, response, options);
  });
}
