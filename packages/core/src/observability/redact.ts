const SENSITIVE_KEY =
  /private[_ -]?key|seed|mnemonic|payment[_ -]?(?:signature|proof)|authorization|credential|github[_ -]?token|ledger[_ -]?token|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|service[_ -]?role(?:[_ -]?key)?|supabase[_ -]?service[_ -]?role(?:[_ -]?key)?/i;

const SENSITIVE_ASSIGNMENT =
  /(["']?(?:private[_ -]?key|seed(?: phrase)?|mnemonic|payment[_ -]?(?:signature|proof)|authorization|credential|github[_ -]?token|ledger[_ -]?token|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|service[_ -]?role(?:[_ -]?key)?|supabase[_ -]?service[_ -]?role(?:[_ -]?key)?)["']?\s*[:=]\s*)(["'][^"']*["']|[^,;}\s]+)/gi;

const SENSITIVE_HEADER =
  /\b(PAYMENT-SIGNATURE|PAYMENT-PROOF|AUTHORIZATION)\b\s*[:=]?\s+([^\s,;]+)/gi;

const SENSITIVE_QUERY_PARAMETER =
  /([?&](?:token|access_token|api_key|key|secret|signature|authorization)=)([^&#\s]*)/gi;
const ENCODED_SENSITIVE_QUERY_PARAMETER =
  /((?:%3F|%26)(?:token|access_token|api_key|key|secret|signature|authorization)(?:%3D))([^&#\s]*)/gi;
const ANSI_ESCAPE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/g;

export function redactString(value: string): string {
  return value
    .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]")
    .replace(SENSITIVE_HEADER, "$1: [REDACTED]")
    .replace(SENSITIVE_QUERY_PARAMETER, "$1[REDACTED]")
    .replace(ENCODED_SENSITIVE_QUERY_PARAMETER, "$1[REDACTED]")
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARACTER, "");
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
