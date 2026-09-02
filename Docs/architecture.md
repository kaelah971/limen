# Limen P0/P1/P2/P4 Architecture

Limen is a release evidence gate, not a vulnerability oracle. P0 establishes the external evidence boundaries; P1 applies a bounded deterministic policy to normalized evidence; P2 loads that policy from the repository; P4 adds a read-only GitHub evidence adapter.

```text
    limen.yml
        |
        v
  parse / validate
        |
        v
    normalize
        |
        v
 deterministic version
        |
        v
    LimenPolicy
        +
RepositoryExposureEvidence
        +
TelegraphEvidenceInput
        |
        v
  Decision Engine
            |
            v
  LimenDecisionResult
            |
            v
     PASS / HOLD / REVIEW
```

## Source Boundaries

GitHub and Dependabot own repository-specific facts: package identity, installed version, vulnerable range, first patched version, manifest path, dependency scope, relationship, repository advisory context, and the normalized `exposureState` (`affected`, `patched`, `not_affected`, or `unknown`). The P4 adapter normalizes these facts into `RepositoryExposureEvidence`; P1 consumes that conclusion and does not calculate semantic versions.

Telegraph owns routed second-source CVE evidence: CVE facts, severity, CVSS, description, references, Intent, Miner provenance, request cost, duration, payment/routing metadata, and incomplete signals. The decision boundary receives this as an explicit `TelegraphEvidenceInput` union: `{ status: "available", evidence }` or `{ status: "failed", code }`. Telegraph does not determine whether this repository is exploitable.

Limen owns deterministic policy evaluation. P2 parses, validates, normalizes, and versions the external `limen.yml` document into the existing `LimenPolicy`. P1 validates that normalized contract, evaluates the fixed precedence rules, and emits the canonical `LimenDecisionResult`. The evaluator does not read `limen.yml`.

## Policy Flow

The policy boundary is intentionally configuration-only:

```text
limen.yml
   |
   v
safe YAML parser
   |
   v
strict external schema validation
   |
   v
normalized LimenPolicy content
   |
   v
canonical serialization -> SHA-256 -> LP-<short-hash>
   |
   v
P1 decision engine
```

`packages/core/src/policy` owns this Node-side filesystem and YAML boundary. It supports root `limen.yml` and falls back to root `limen.yaml` only when `limen.yml` is absent. An explicit loader path takes precedence over filename discovery. The policy parser has no network, shell, environment expansion, remote includes, executable hooks, or GitHub integration.

## GitHub Flow

`packages/github` is a read-only REST adapter. It owns GitHub transport, runtime response validation, rate-limit metadata, advisory enrichment, and conversion into the existing repository evidence contract. It does not call Telegraph, load policy, or evaluate a release decision.

1. Call Dependency Review compare with repository owner/name and explicit base/head revisions.
2. Reject abbreviated commit SHAs when a revision is not explicitly marked as a ref.
3. Reject dependency snapshot warnings because a warning makes the diff non-authoritative.
4. Normalize added or changed vulnerable dependencies as `affected` candidates.
5. Optionally enrich a Dependency Review GHSA with the Global Advisory endpoint.
6. Match advisory vulnerability metadata by normalized ecosystem and exact package identity; ambiguous matches preserve range and patch as `null`.
7. Normalize Dependabot alerts separately as default-branch repository evidence; an open alert is `affected`, while dismissed, auto-dismissed, or fixed alerts are inactive candidates.
8. Emit final `RepositoryExposureEvidence` only for active candidates with a valid CVE. GHSA-only or inactive candidates remain explicit normalization results and cannot be mistaken for final evidence.

The client uses `application/vnd.github+json`, API version `2026-03-10`, optional Bearer authentication, bounded timeouts, and typed errors for authentication, permission, rate-limit, response-shape, advisory-not-found, snapshot-warning, and evidence-conflict cases. It performs only `GET` requests.

## Telegraph Flow

`packages/telegraph` owns the Engine and x402 boundary. Limen sends an auto-routed request to the configured Telegraph `/v1/ask` endpoint; it does not select a Miner or send a top-level Intent.

1. Create a CVE-specific natural-language `query` and optional `{ cve_id }` context.
2. Send the request to Telegraph `/v1/ask`.
3. Require the live HTTP `402` challenge.
4. Parse and validate challenge values, including the expected network and `exact` scheme.
5. Construct payment with the official x402 EVM client using the challenge's `payTo`, asset, amount, and timeout.
6. Retry once with `PAYMENT-SIGNATURE`.
7. Require `response.intent === "CVE_LOOKUP"`; another or missing Intent is `TELEGRAPH_ROUTING_ERROR`.
8. Normalize the successful routed response into `TelegraphCveEvidence`.

The payment adapter hides x402 details from the rest of Limen. Challenge price and recipient are never taken from catalog metadata or hardcoded in the client. A Base Sepolia expectation rejects a mainnet challenge with `UNEXPECTED_NETWORK`.

Engine provenance is retained without claiming more identity than the response provides. `minerId` is Limen's existing field name for the opaque Engine `miner_used` value; it may be a Miner ID or slug, and is not asserted to be an on-chain identity. `miner_name`, `timestamp`, `reasoning`, `endpoint`, `cost_usd`, and `duration_ms` are preserved in their corresponding normalized fields when present. Sensitive values are redacted.

## Canonical Object

There is one future decision source of truth: `LimenDecisionResult`. The P1 decision engine, GitHub Action, API, evidence ledger, receipts, web app, metrics, and Judge Mode must consume that object. Presentation layers may derive view models but must not create competing decision formats.

## P1 Decision Engine

The evaluator is a pure function. It receives decision metadata, normalized repository evidence, explicit Telegraph evidence state, and a validated policy. It does not read the network, environment, filesystem, database, GitHub, or wallet state, and it does not generate timestamps or identifiers.

P1 uses this precedence:

1. Telegraph failure -> `REVIEW` with `TELEGRAPH_UNAVAILABLE`.
2. Missing required Telegraph CVE identity or severity -> `REVIEW` with `EXTERNAL_EVIDENCE_INCOMPLETE`.
3. Unknown or malformed severity from either source -> `REVIEW` with `SEVERITY_UNKNOWN`.
4. CVE identity mismatch -> `REVIEW` with `CVE_IDENTITY_CONFLICT`.
5. Material severity mismatch -> `REVIEW` with `SEVERITY_CONFLICT`.
6. Unknown repository exposure -> `REVIEW` with `EXPOSURE_UNKNOWN`.
7. Affected dependency with unknown scope -> `REVIEW` with `DEPENDENCY_SCOPE_UNKNOWN`.
8. Affected dependency in a blocked scope with a blocked severity -> `HOLD` with `AFFECTED_BLOCKING_DEPENDENCY`.
9. Otherwise, complete non-blocking evidence -> `PASS` with `NO_BLOCKING_CONDITION`.

The P1 policy only permits `review` for uncertainty settings. Blocking severities and dependency scopes are bounded arrays with strict runtime validation. Policy parsing and broader policy actions remain future work.

## Normalization And Uncertainty

External responses are treated as `unknown` at the boundary. Missing severity becomes `null` for missing Telegraph evidence; present but unrecognized severity becomes `UNKNOWN`. Missing CVSS, versions, fix availability, and Miner provenance remain `null`; missing references become `[]`. P0 does not infer fixed versions from prose or create confidence scores.

CVE identity is visible and conservative. Malformed or conflicting identities normalize to `null` while the redacted raw response remains available for later policy handling. An HTTP `200` is only a transport result; it is not release approval.

## Limen Does Not Claim

- Telegraph proves that a repository is safe.
- Telegraph determines project exploitability.
- HTTP `200` from a Miner equals release approval.
- Missing external data means safe.
- Miner output alone authorizes a release.
- Validator decentralization certifies a release unless independently proven for the shown environment.

## Limen Does Claim

- Repository/advisory sources provide repository-specific exposure facts.
- Telegraph provides routed second-source CVE evidence.
- Provenance, payment, and routing metadata are retained when safely exposed.
- Repository policy makes the final decision.
- Missing, malformed, or conflicting evidence can become `REVIEW`.

## P0/P1/P2/P4 Boundary

P0/P1/P2/P4 contain the external evidence contracts, Telegraph adapter, policy loader, and read-only GitHub adapter. They intentionally contain no GitHub Action, ledger, release authentication, receipts, web UI, dashboard, or design-system implementation. Those remain later milestones in the approved build plan.
