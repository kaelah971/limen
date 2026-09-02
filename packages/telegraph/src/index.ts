export {
  BASE_SEPOLIA_NETWORK,
  assertExpectedNetwork,
  networksMatch,
  normalizeNetwork,
} from "./network";

export {
  diagnoseTelegraphConfiguration,
  isBaseSepoliaConfig,
  loadTelegraphConfig,
  type TelegraphConfigurationDiagnostics,
} from "./config";

export {
  assertSuccessfulEngineResponse,
  validatePaymentChallenge,
  verifyEngineIntent,
  type ValidatedPaymentChallenge,
} from "./schemas";

export {
  isNormalizationError,
  normalizeTelegraphEvidence,
  type TelegraphNormalizationContext,
} from "./normalize";

export {
  createOfficialX402PaymentAdapter,
  createTelegraphClient,
  TelegraphEngineClient,
  type TelegraphEngineClientOptions,
} from "./client";

export type {
  CveLookupInput,
  PaymentPreparationInput,
  PreparedPayment,
  TelegraphClient,
  TelegraphConfig,
  TelegraphPaymentAdapter,
} from "./types";
