import { getPublicReceiptApiUrl } from "./receipt-api";
import {
  buildLimenWorkflow,
  DEFAULT_LIMEN_POLICY,
  type SetupGenerationConfig,
} from "../../packages/github-app/src/setup";

function getSetupGenerationConfig(
  environment: Record<string, string | undefined> = process.env,
): SetupGenerationConfig {
  const actionSha = environment.LIMEN_ACTION_SHA?.trim();
  if (actionSha === undefined || actionSha === "") {
    throw new Error("LIMEN_ACTION_SHA is required for the setup contract.");
  }

  return {
    actionSha,
    limenApiUrl: getPublicReceiptApiUrl(environment),
  };
}

const SETUP_GENERATION_CONFIG = getSetupGenerationConfig();

export const CURRENT_ACTION_REFERENCE =
  `kaelah971/limen@${SETUP_GENERATION_CONFIG.actionSha}`;

export const CURRENT_TELEGRAPH_ENGINE_URL =
  "http://13.237.89.59:7044/engine/v1/ask";

export const CURRENT_TELEGRAPH_NETWORK = "eip155:84532";

export const CURRENT_WORKFLOW = buildLimenWorkflow(SETUP_GENERATION_CONFIG);

export const RECOMMENDED_POLICY = DEFAULT_LIMEN_POLICY.trimEnd();

export const MINIMAL_POLICY = `production:
  block_severity:
    - high
  dependency_scopes:
    - runtime`;
