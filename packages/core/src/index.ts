export {
  DecisionCheckSchema,
  DependencyRelationshipSchema,
  DependencyScopeSchema,
  LimenPolicySchema,
  LimenDecisionResultSchema,
  LimenReasonCodeSchema,
  RepositoryExposureEvidenceSchema,
  RepositoryExposureStateSchema,
  SeveritySchema,
  TelegraphCveEvidenceSchema,
  TelegraphEvidenceInputSchema,
} from "./schemas/domain";

export { evaluateLimenDecision, validateLimenPolicy } from "./decision/evaluate";

export {
  normalizeSeverity,
  type DecisionCheck,
  type DecisionCheckOutcome,
  type DependencyRelationship,
  type DependencyScope,
  type LimenDecisionInput,
  type LimenDecision,
  type LimenPolicy,
  type LimenPolicyUncertaintyAction,
  type LimenDecisionResult,
  type LimenReasonCode,
  type RepositoryExposureEvidence,
  type RepositoryExposureState,
  type Severity,
  type TelegraphCveEvidence,
  type TelegraphEvidenceAvailable,
  type TelegraphEvidenceFailure,
  type TelegraphEvidenceInput,
  type TelegraphFailureCode,
} from "./domain/types";

export {
  ConfigurationError,
  LimenError,
  LimenPolicyDuplicateKeyError,
  LimenPolicyNotFoundError,
  LimenPolicyParseError,
  LimenPolicyReadError,
  LimenPolicyValidationError,
  TelegraphChallengeError,
  TelegraphEngineError,
  TelegraphNormalizationError,
  TelegraphPaymentError,
  TelegraphResponseError,
  TelegraphRoutingError,
  UnexpectedNetworkError,
  isLimenError,
  serializeError,
  type LimenErrorCode,
  type SerializedLimenError,
} from "./errors/errors";

export { redactSecrets, redactString } from "./observability/redact";

export {
  LOCAL_HOSTS,
  parseOutboundUrl,
  type OutboundUrlPolicy,
} from "./network/outbound";

export {
  createObservabilityLogger,
  LimenObservabilityEventSchema,
  LimenObservabilityStageSchema,
  observabilityErrorFields,
  sanitizeObservabilityEvent,
  serializeObservabilityEvent,
  startObservabilityStage,
  type LimenCorrelationContext,
  type LimenObservabilityEvent,
  type LimenObservabilityLogger,
  type LimenObservabilitySink,
  type LimenObservabilityStage,
  type ObservabilityStageHandle,
} from "./observability/events";

export {
  loadLimenPolicy,
  parseLimenPolicy,
  type LimenPolicySource,
  type LoadLimenPolicyOptions,
  type LoadedLimenPolicy,
} from "./policy";
