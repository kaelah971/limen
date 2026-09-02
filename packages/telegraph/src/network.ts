import { UnexpectedNetworkError } from "../../core/src/errors/errors";

export const BASE_SEPOLIA_NETWORK = "eip155:84532";

const NETWORK_ALIASES: Record<string, string> = {
  "base-sepolia": BASE_SEPOLIA_NETWORK,
  "eip155:84532": BASE_SEPOLIA_NETWORK,
  "84532": BASE_SEPOLIA_NETWORK,
};

export function normalizeNetwork(value: string): string {
  const trimmed = value.trim();
  const alias = NETWORK_ALIASES[trimmed.toLowerCase()];
  if (alias) {
    return alias;
  }

  const separator = trimmed.indexOf(":");
  if (separator <= 0 || separator === trimmed.length - 1) {
    return trimmed;
  }

  return `${trimmed.slice(0, separator).toLowerCase()}:${trimmed.slice(separator + 1)}`;
}

export function networksMatch(actual: string, expected: string): boolean {
  return normalizeNetwork(actual) === normalizeNetwork(expected);
}

export function assertExpectedNetwork(
  actual: string,
  expected: string,
): void {
  if (!networksMatch(actual, expected)) {
    throw new UnexpectedNetworkError(
      "Telegraph requested an unexpected payment network.",
      {
        actualNetwork: normalizeNetwork(actual),
        expectedNetwork: normalizeNetwork(expected),
      },
    );
  }
}
