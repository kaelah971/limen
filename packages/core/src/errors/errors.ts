import { redactSecrets, redactString } from "../observability/redact";

export type LimenErrorCode =
  | "TELEGRAPH_CHALLENGE_ERROR"
  | "TELEGRAPH_PAYMENT_ERROR"
  | "TELEGRAPH_ENGINE_ERROR"
  | "TELEGRAPH_ROUTING_ERROR"
  | "TELEGRAPH_RESPONSE_ERROR"
  | "TELEGRAPH_NORMALIZATION_ERROR"
  | "UNEXPECTED_NETWORK"
  | "CONFIGURATION_ERROR"
  | "LIMEN_POLICY_NOT_FOUND"
  | "LIMEN_POLICY_READ_ERROR"
  | "LIMEN_POLICY_PARSE_ERROR"
  | "LIMEN_POLICY_VALIDATION_ERROR"
  | "LIMEN_POLICY_DUPLICATE_KEY";

export interface SerializedLimenError {
  name: string;
  code: LimenErrorCode | "UNKNOWN_ERROR";
  message: string;
  details?: unknown;
}

export class LimenError extends Error {
  readonly code: LimenErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: LimenErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(redactString(message));
    this.name = "LimenError";
    this.code = code;
    this.details = details
      ? (redactSecrets(details) as Record<string, unknown>)
      : details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): SerializedLimenError {
    return {
      name: this.name,
      code: this.code,
      message: redactString(this.message),
      ...(this.details === undefined
        ? {}
        : { details: redactSecrets(this.details) }),
    };
  }
}

export class TelegraphChallengeError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TELEGRAPH_CHALLENGE_ERROR", message, details);
  }
}

export class TelegraphPaymentError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TELEGRAPH_PAYMENT_ERROR", message, details);
  }
}

export class TelegraphEngineError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TELEGRAPH_ENGINE_ERROR", message, details);
  }
}

export class TelegraphRoutingError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TELEGRAPH_ROUTING_ERROR", message, details);
  }
}

export class TelegraphResponseError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TELEGRAPH_RESPONSE_ERROR", message, details);
  }
}

export class TelegraphNormalizationError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("TELEGRAPH_NORMALIZATION_ERROR", message, details);
  }
}

export class UnexpectedNetworkError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("UNEXPECTED_NETWORK", message, details);
  }
}

export class ConfigurationError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFIGURATION_ERROR", message, details);
  }
}

export class LimenPolicyNotFoundError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LIMEN_POLICY_NOT_FOUND", message, details);
  }
}

export class LimenPolicyReadError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LIMEN_POLICY_READ_ERROR", message, details);
  }
}

export class LimenPolicyParseError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LIMEN_POLICY_PARSE_ERROR", message, details);
  }
}

export class LimenPolicyValidationError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LIMEN_POLICY_VALIDATION_ERROR", message, details);
  }
}

export class LimenPolicyDuplicateKeyError extends LimenError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("LIMEN_POLICY_DUPLICATE_KEY", message, details);
  }
}

export function isLimenError(error: unknown): error is LimenError {
  return error instanceof LimenError;
}

export function serializeError(error: unknown): SerializedLimenError {
  if (isLimenError(error)) {
    return error.toJSON();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      code: "UNKNOWN_ERROR",
      message: redactString(error.message),
    };
  }

  return {
    name: "UnknownError",
    code: "UNKNOWN_ERROR",
    message: "An unknown error occurred.",
  };
}
