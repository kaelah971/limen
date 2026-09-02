import * as actionsCore from "@actions/core";
import { ConfigurationError } from "../../packages/core/src";
import type { ActionInputs } from "./types";

export interface ActionInputReader {
  getInput(
    name: string,
    options?: { required?: boolean; trimWhitespace?: boolean },
  ): string;
  setSecret(value: string): void;
}

export function parseMaxLookups(value: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new ConfigurationError("max-lookups must be an integer from 1 to 20.", {
      field: "max-lookups",
    });
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new ConfigurationError("max-lookups must be an integer from 1 to 20.", {
      field: "max-lookups",
    });
  }
  return parsed;
}

export function readActionInputs(
  reader: ActionInputReader = actionsCore,
  environment: Record<string, string | undefined> = process.env,
): ActionInputs {
  const githubToken = reader.getInput("github-token", { required: true }).trim();
  if (githubToken === "") {
    throw new ConfigurationError("github-token is required.", {
      field: "github-token",
    });
  }
  reader.setSecret(githubToken);

  const inputPrivateKey = reader.getInput("telegraph-private-key").trim();
  const telegraphPrivateKey = inputPrivateKey || environment.TELEGRAPH_PRIVATE_KEY?.trim() || undefined;
  if (telegraphPrivateKey !== undefined) {
    reader.setSecret(telegraphPrivateKey);
  }

  const inputEngineUrl = reader.getInput("telegraph-engine-url").trim();
  const inputNetwork = reader.getInput("expected-network").trim();

  return {
    githubToken,
    ...(telegraphPrivateKey === undefined ? {} : { telegraphPrivateKey }),
    ...(inputEngineUrl || environment.TELEGRAPH_ENGINE_URL
      ? { telegraphEngineUrl: inputEngineUrl || environment.TELEGRAPH_ENGINE_URL }
      : {}),
    ...(inputNetwork || environment.TELEGRAPH_EXPECTED_NETWORK
      ? { expectedNetwork: inputNetwork || environment.TELEGRAPH_EXPECTED_NETWORK }
      : {}),
    maxLookups: parseMaxLookups(reader.getInput("max-lookups") || "5"),
  };
}
