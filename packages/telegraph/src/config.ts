import { z } from "zod";
import { ConfigurationError } from "../../core/src/errors/errors";
import { BASE_SEPOLIA_NETWORK, normalizeNetwork } from "./network";
import type { TelegraphConfig } from "./types";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const NETWORK_PATTERN = /^[^:\s]+:[^:\s]+$/;

const EnvironmentSchema = z.object({
  TELEGRAPH_ENGINE_URL: z.string().url(),
  TELEGRAPH_PRIVATE_KEY: z.string().regex(PRIVATE_KEY_PATTERN),
  TELEGRAPH_EXPECTED_NETWORK: z.string().min(1).default(BASE_SEPOLIA_NETWORK),
  TELEGRAPH_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(30_000),
});

export function loadTelegraphConfig(
  environment: Record<string, string | undefined> = process.env,
): TelegraphConfig {
  const parsed = EnvironmentSchema.safeParse({
    TELEGRAPH_ENGINE_URL: environment.TELEGRAPH_ENGINE_URL,
    TELEGRAPH_PRIVATE_KEY: environment.TELEGRAPH_PRIVATE_KEY,
    TELEGRAPH_EXPECTED_NETWORK:
      environment.TELEGRAPH_EXPECTED_NETWORK ?? BASE_SEPOLIA_NETWORK,
    TELEGRAPH_TIMEOUT_MS: environment.TELEGRAPH_TIMEOUT_MS ?? "30000",
  });

  if (!parsed.success) {
    throw new ConfigurationError(
      "Telegraph configuration is invalid.",
      {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    );
  }

  const expectedNetwork = normalizeNetwork(parsed.data.TELEGRAPH_EXPECTED_NETWORK);
  if (!NETWORK_PATTERN.test(expectedNetwork)) {
    throw new ConfigurationError(
      "TELEGRAPH_EXPECTED_NETWORK must use a namespace:reference format.",
      { field: "TELEGRAPH_EXPECTED_NETWORK" },
    );
  }

  return {
    engineUrl: parsed.data.TELEGRAPH_ENGINE_URL,
    privateKey: parsed.data.TELEGRAPH_PRIVATE_KEY,
    expectedNetwork,
    timeoutMs: parsed.data.TELEGRAPH_TIMEOUT_MS,
  };
}

export function isBaseSepoliaConfig(config: TelegraphConfig): boolean {
  return normalizeNetwork(config.expectedNetwork) === BASE_SEPOLIA_NETWORK;
}
