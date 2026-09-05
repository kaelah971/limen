import { z } from "zod";
import { ConfigurationError, parseOutboundUrl } from "../../core/src";
import { BASE_SEPOLIA_NETWORK, normalizeNetwork } from "./network";
import type { TelegraphConfig } from "./types";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const NETWORK_PATTERN = /^[^:\s]+:[^:\s]+$/;
export const CANONICAL_TELEGRAPH_ENGINE_URL =
  "http://13.237.89.59:7044/engine/v1/ask";
const EngineUrlSchema = z.string().refine(isAllowedEngineUrl, {
  message: "TELEGRAPH_ENGINE_URL must be the validated Judge Mode Engine endpoint.",
});
const PrivateKeySchema = z.string().regex(PRIVATE_KEY_PATTERN);
const TimeoutSchema = z.coerce.number().int().positive().max(120_000);

const EnvironmentSchema = z.object({
  TELEGRAPH_ENGINE_URL: EngineUrlSchema,
  TELEGRAPH_PRIVATE_KEY: PrivateKeySchema,
  TELEGRAPH_EXPECTED_NETWORK: z.string().min(1).default(BASE_SEPOLIA_NETWORK),
  TELEGRAPH_TIMEOUT_MS: TimeoutSchema.default(30_000),
});

export interface TelegraphConfigurationDiagnostics {
  fields: {
    field:
      | "TELEGRAPH_PRIVATE_KEY"
      | "TELEGRAPH_ENGINE_URL"
      | "TELEGRAPH_EXPECTED_NETWORK"
      | "TELEGRAPH_TIMEOUT_MS";
    present: boolean;
    trimmedLength?: number;
    matchesRequiredPattern?: boolean;
    validUrl?: boolean;
    normalizedValue?: string;
    validValue?: boolean;
  }[];
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function isAllowedEngineUrl(value: string): boolean {
  try {
    const parsed = parseOutboundUrl(value, {
      name: "Telegraph Engine",
      allowHttpHosts: new Set(["13.237.89.59"]),
    });
    return parsed.href === CANONICAL_TELEGRAPH_ENGINE_URL;
  } catch {
    return false;
  }
}

export function assertTelegraphEngineUrl(value: string): void {
  if (!isAllowedEngineUrl(value)) {
    throw new ConfigurationError(
      "TELEGRAPH_ENGINE_URL must be the validated Judge Mode Engine endpoint.",
      { field: "TELEGRAPH_ENGINE_URL" },
    );
  }
}

export function diagnoseTelegraphConfiguration(
  environment: Record<string, string | undefined> = process.env,
): TelegraphConfigurationDiagnostics {
  const privateKey = environment.TELEGRAPH_PRIVATE_KEY?.trim();
  const engineUrl = environment.TELEGRAPH_ENGINE_URL?.trim();
  const expectedNetwork = trimOptional(environment.TELEGRAPH_EXPECTED_NETWORK);
  const timeout = trimOptional(environment.TELEGRAPH_TIMEOUT_MS);

  return {
    fields: [
      {
        field: "TELEGRAPH_PRIVATE_KEY",
        present: privateKey !== undefined && privateKey !== "",
        trimmedLength: privateKey?.length ?? 0,
        matchesRequiredPattern:
          privateKey !== undefined && PrivateKeySchema.safeParse(privateKey).success,
      },
      {
        field: "TELEGRAPH_ENGINE_URL",
        present: engineUrl !== undefined && engineUrl !== "",
        validUrl:
          engineUrl !== undefined && EngineUrlSchema.safeParse(engineUrl).success,
      },
      {
        field: "TELEGRAPH_EXPECTED_NETWORK",
        present: expectedNetwork !== undefined,
        normalizedValue: normalizeNetwork(expectedNetwork ?? BASE_SEPOLIA_NETWORK),
      },
      {
        field: "TELEGRAPH_TIMEOUT_MS",
        present: timeout !== undefined,
        normalizedValue: timeout ?? "30000",
        validValue: TimeoutSchema.safeParse(timeout ?? "30000").success,
      },
    ],
  };
}

export function loadTelegraphConfig(
  environment: Record<string, string | undefined> = process.env,
): TelegraphConfig {
  const expectedNetwork = trimOptional(environment.TELEGRAPH_EXPECTED_NETWORK);
  const timeout = trimOptional(environment.TELEGRAPH_TIMEOUT_MS);
  const parsed = EnvironmentSchema.safeParse({
    TELEGRAPH_ENGINE_URL: environment.TELEGRAPH_ENGINE_URL?.trim(),
    TELEGRAPH_PRIVATE_KEY: environment.TELEGRAPH_PRIVATE_KEY?.trim(),
    TELEGRAPH_EXPECTED_NETWORK: expectedNetwork ?? BASE_SEPOLIA_NETWORK,
    TELEGRAPH_TIMEOUT_MS: timeout ?? "30000",
  });

  if (!parsed.success) {
    throw new ConfigurationError(
      "Telegraph configuration is invalid.",
      {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
        diagnostics: diagnoseTelegraphConfiguration(environment),
      },
    );
  }

  assertTelegraphEngineUrl(parsed.data.TELEGRAPH_ENGINE_URL);

  const normalizedExpectedNetwork = normalizeNetwork(parsed.data.TELEGRAPH_EXPECTED_NETWORK);
  if (!NETWORK_PATTERN.test(normalizedExpectedNetwork)) {
    throw new ConfigurationError(
      "TELEGRAPH_EXPECTED_NETWORK must use a namespace:reference format.",
      {
        field: "TELEGRAPH_EXPECTED_NETWORK",
        diagnostics: diagnoseTelegraphConfiguration(environment),
      },
    );
  }

  return {
    engineUrl: parsed.data.TELEGRAPH_ENGINE_URL,
    privateKey: parsed.data.TELEGRAPH_PRIVATE_KEY,
    expectedNetwork: normalizedExpectedNetwork,
    timeoutMs: parsed.data.TELEGRAPH_TIMEOUT_MS,
  };
}

export function isBaseSepoliaConfig(config: TelegraphConfig): boolean {
  return normalizeNetwork(config.expectedNetwork) === BASE_SEPOLIA_NETWORK;
}
