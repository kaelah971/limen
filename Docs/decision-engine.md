# Limen P1 Decision Engine

P1 turns normalized repository exposure evidence and paid routed Telegraph evidence into one deterministic `LimenDecisionResult`. It is a policy evaluator, not a vulnerability oracle.

## Inputs

`RepositoryExposureEvidence` includes the normalized conclusion needed by P1:

```typescript
type RepositoryExposureState =
  | "affected"
  | "patched"
  | "not_affected"
  | "unknown";
```

P1 does not infer this state from version ranges. A future repository adapter may calculate it using the appropriate ecosystem tooling.

Telegraph evidence is never represented as a nullable evaluator input:

```typescript
type TelegraphEvidenceInput =
  | { status: "available"; evidence: TelegraphCveEvidence }
  | { status: "failed"; code: TelegraphFailureCode };
```

The failure branch carries only a classified code. Payment signatures, payment proof, private keys, and raw failure messages do not cross this boundary.

## Bounded Policy

P1 validates this strict policy shape:

```typescript
interface LimenPolicy {
  version: string;
  blockedSeverities: ("LOW" | "MEDIUM" | "HIGH" | "CRITICAL")[];
  dependencyScopes: ("runtime" | "development")[];
  missingExternalEvidence: "review";
  severityConflict: "review";
  cveIdentityConflict: "review";
  telegraphFailure: "review";
  unknownExposure: "review";
}
```

The P1 test fixture is intentionally fixed:

```yaml
version: p1-test
blockedSeverities:
  - CRITICAL
  - HIGH
dependencyScopes:
  - runtime
missingExternalEvidence: review
severityConflict: review
cveIdentityConflict: review
telegraphFailure: review
unknownExposure: review
```

Duplicate values, unknown severities or scopes, missing fields, unsupported uncertainty actions, and unknown properties fail with `CONFIGURATION_ERROR`. YAML parsing is not part of P1.

## Precedence

The evaluator checks conditions in this order. The first applicable review condition wins, so the same evidence always produces the same reason code.

1. A failed Telegraph input produces `REVIEW` / `TELEGRAPH_UNAVAILABLE`.
2. Missing Telegraph CVE identity or severity produces `REVIEW` / `EXTERNAL_EVIDENCE_INCOMPLETE`.
3. An explicit `UNKNOWN` severity from either source produces `REVIEW` / `SEVERITY_UNKNOWN`.
4. A malformed or mismatched repository/Telegraph CVE identity produces `REVIEW` / `CVE_IDENTITY_CONFLICT`.
5. Two known, different severity values produce `REVIEW` / `SEVERITY_CONFLICT`.
6. Unknown repository exposure produces `REVIEW` / `EXPOSURE_UNKNOWN`.
7. An affected dependency with unknown scope produces `REVIEW` / `DEPENDENCY_SCOPE_UNKNOWN`.
8. An affected dependency in a configured scope with a configured blocking severity produces `HOLD` / `AFFECTED_BLOCKING_DEPENDENCY`.
9. Patched, non-affected, non-blocked-scope, or non-blocking-severity evidence produces `PASS` / `NO_BLOCKING_CONDITION`.

Telegraph evidence can support severity, but it cannot create `HOLD` without repository-specific affected exposure and a matching policy scope.

## Canonical Output

Every successful evaluation returns the existing `LimenDecisionResult` contract. It contains the decision, stable reason code, summary, repository evidence, available Telegraph evidence or `null` for a failed input, ordered checks, caller-supplied evaluation timestamp, and policy version. Failed Telegraph state is represented in the decision reason and availability check; it is not silently treated as successful or omitted from evaluation.

## Purity And Scope

`evaluateLimenDecision` validates its policy and normalized input, then performs no I/O and does not mutate input. IDs and timestamps are supplied by the caller so repeated evaluation of the same input is deterministic.

P1 deliberately excludes YAML policy parsing, GitHub/Dependabot ingestion, semantic-version calculation, persistence, receipts, Action integration, authentication, and UI work.
