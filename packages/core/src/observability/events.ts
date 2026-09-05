import { z } from "zod";
import { serializeError } from "../errors/errors";
import { redactSecrets, redactString } from "./redact";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const CVE_ID = /^CVE-\d{4}-\d{4,}$/i;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export const LimenObservabilityStageSchema = z.enum([
  "event-validation",
  "policy-retrieval",
  "policy-parse",
  "dependency-review",
  "advisory-enrichment",
  "finding-selection",
  "telegraph-initialization",
  "telegraph-cve-lookup",
  "decision-evaluation",
  "aggregate-decision",
  "summary-output",
  "ledger-persistence",
  "workflow-result",
  "api-request",
]);

export const LimenObservabilityEventSchema = z.object({
  timestamp: z.string().min(1),
  level: z.enum(["info", "warning", "error"]),
  event: z.enum(["START", "SUCCESS", "FAILURE"]),
  stage: LimenObservabilityStageSchema,
  limenRunId: z.string().min(1).optional(),
  githubRunId: z.number().int().positive().optional(),
  githubRunAttempt: z.number().int().positive().optional(),
  repository: z.string().min(1).max(255).optional(),
  pullRequestNumber: z.number().int().positive().optional(),
  baseSha: z.string().regex(FULL_SHA).optional(),
  headSha: z.string().regex(FULL_SHA).optional(),
  policyVersion: z.string().min(1).max(64).optional(),
  cve: z.string().regex(CVE_ID).optional(),
  attempt: z.number().int().positive().optional(),
  maxAttempts: z.number().int().positive().optional(),
  retryCount: z.number().int().min(0).optional(),
  durationMs: z.number().int().min(0).optional(),
  outcome: z.enum([
    "started",
    "success",
    "failed",
    "retrying",
    "skipped",
    "partial",
    "pass",
    "hold",
    "review",
  ]).optional(),
  reasonCode: z.string().regex(SAFE_CODE).optional(),
  errorCode: z.string().regex(SAFE_CODE).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  requestCount: z.number().int().min(0).optional(),
  requestIndex: z.number().int().positive().optional(),
  costUsd: z.number().finite().min(0).nullable().optional(),
  requestedAt: z.string().min(1).optional(),
  receivedAt: z.string().min(1).optional(),
  intent: z.literal("CVE_LOOKUP").optional(),
  minerName: z.string().max(512).optional(),
  providerDurationMs: z.number().int().min(0).nullable().optional(),
  network: z.string().max(128).optional(),
  paymentScheme: z.string().max(128).optional(),
  phase: z.enum(["challenge", "paid"]).optional(),
  requestId: z.string().regex(SAFE_REQUEST_ID).optional(),
  method: z.string().regex(/^[A-Z]{1,16}$/).optional(),
  route: z.string().min(1).max(128).optional(),
});

export type LimenObservabilityStage = z.infer<typeof LimenObservabilityStageSchema>;
export type LimenObservabilityEvent = z.infer<typeof LimenObservabilityEventSchema>;

export interface LimenCorrelationContext {
  limenRunId: string;
  githubRunId?: number;
  githubRunAttempt?: number;
  repository?: string;
  pullRequestNumber?: number;
  baseSha?: string;
  headSha?: string;
  policyVersion?: string;
}

export interface LimenObservabilitySink {
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface LimenObservabilityLogger {
  emit(event: LimenObservabilityEvent): void;
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutUndefined);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nestedValue]) => nestedValue !== undefined)
      .map(([key, nestedValue]) => [key, withoutUndefined(nestedValue)]),
  );
}

function safeLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value).replace(/[\r\n]/g, " ");
  }
  if (Array.isArray(value)) {
    return value.map(safeLogValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      redactString(key),
      safeLogValue(nestedValue),
    ]),
  );
}

export function sanitizeObservabilityEvent(value: unknown): LimenObservabilityEvent {
  const sanitized = safeLogValue(redactSecrets(withoutUndefined(value)));
  return LimenObservabilityEventSchema.parse(sanitized);
}

export function serializeObservabilityEvent(value: unknown): string {
  return `LIMEN_OBSERVABILITY ${JSON.stringify(sanitizeObservabilityEvent(value))}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : undefined;
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value) ? value : undefined;
}

function safeStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

export function observabilityErrorFields(error: unknown): Pick<
  LimenObservabilityEvent,
  "errorCode" | "httpStatus" | "requestId" | "retryCount"
> {
  const serialized = serializeError(error);
  const raw = record(error) ? error : undefined;
  const details = record(serialized.details) ? serialized.details : undefined;
  const nestedMetadata = details && record(details.metadata) ? details.metadata : undefined;
  const status = safeStatus(raw?.status) ?? safeStatus(details?.status) ?? safeStatus(nestedMetadata?.status);
  const requestId = safeRequestId(details?.requestId)
    ?? safeRequestId(nestedMetadata?.requestId);
  const code = safeCode(raw?.code) ?? safeCode(serialized.code);

  return {
    ...(code === undefined ? {} : { errorCode: code }),
    ...(status === undefined ? {} : { httpStatus: status }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

export function createObservabilityLogger(
  sink: LimenObservabilitySink,
  onEvent?: (event: LimenObservabilityEvent) => void,
): LimenObservabilityLogger {
  return {
    emit(event) {
      try {
        const safeEvent = sanitizeObservabilityEvent(event);
        const line = serializeObservabilityEvent(safeEvent);
        onEvent?.(safeEvent);
        sink[safeEvent.level](line);
      } catch {
        sink.warning("Limen observability event was dropped because it was invalid.");
      }
    },
  };
}

function monotonicNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export interface ObservabilityStageHandle {
  success(fields?: Partial<LimenObservabilityEvent>): void;
  failure(error?: unknown, fields?: Partial<LimenObservabilityEvent>): void;
}

export function startObservabilityStage(
  logger: LimenObservabilityLogger | undefined,
  stage: LimenObservabilityStage,
  context: Partial<LimenCorrelationContext> = {},
  now: () => Date = () => new Date(),
  fields: Partial<LimenObservabilityEvent> = {},
): ObservabilityStageHandle {
  const started = monotonicNow();
  logger?.emit({
    timestamp: now().toISOString(),
    level: "info",
    event: "START",
    stage,
    ...context,
    ...fields,
    outcome: "started",
  });

  return {
    success(extra = {}) {
      logger?.emit({
        timestamp: now().toISOString(),
        level: "info",
        event: "SUCCESS",
        stage,
        ...context,
        ...fields,
        ...extra,
        durationMs: Math.max(0, Math.round(monotonicNow() - started)),
        outcome: extra.outcome ?? "success",
      });
    },
    failure(error, extra = {}) {
      logger?.emit({
        timestamp: now().toISOString(),
        level: "error",
        event: "FAILURE",
        stage,
        ...context,
        ...fields,
        ...(error === undefined ? {} : observabilityErrorFields(error)),
        ...extra,
        durationMs: Math.max(0, Math.round(monotonicNow() - started)),
        outcome: extra.outcome ?? "failed",
      });
    },
  };
}
