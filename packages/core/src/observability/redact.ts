const SENSITIVE_KEY =
  /private[_ -]?key|seed|mnemonic|payment[_ -]?(?:signature|proof)|authorization|credential|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret/i;

const SENSITIVE_ASSIGNMENT =
  /(["']?(?:private[_ -]?key|seed(?: phrase)?|mnemonic|payment[_ -]?(?:signature|proof)|authorization|credential|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret)["']?\s*[:=]\s*)(["'][^"']*["']|[^,;}\s]+)/gi;

const SENSITIVE_HEADER =
  /\b(PAYMENT-SIGNATURE|PAYMENT-PROOF|AUTHORIZATION)\b\s*[:=]?\s+([^\s,;]+)/gi;

export function redactString(value: string): string {
  return value
    .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
    .replace(SENSITIVE_HEADER, "$1: [REDACTED]");
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = SENSITIVE_KEY.test(key)
      ? "[REDACTED]"
      : redactSecrets(nestedValue);
  }

  return redacted;
}
