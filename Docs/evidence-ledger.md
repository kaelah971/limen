# Limen Evidence Ledger

P5 adds a durable, server-owned record of Limen release decisions. The ledger preserves the canonical decision and safe provenance after a GitHub workflow finishes. It is an audit persistence boundary, not a second decision engine and not a public receipt service.

## Architecture

```text
GitHub Action
    |
    | sanitized LedgerRunIngest, optional configuration
    v
POST /v1/ledger/runs
    |
    | Bearer machine-to-machine ingest token
    v
Limen ledger API
    |
    | server-only Supabase service-role client
    v
Supabase Postgres
    |
    +--> runs
    +--> decisions
    +--> telegraph_requests
```

The Action never receives a Supabase service-role key. It sends one complete evidence package after the release decision is calculated. The API validates and redacts the package before calling the `persist_limen_run` Postgres function, which inserts the run and its child records in one transaction.

The API is intentionally a small Node/TypeScript HTTP service under `apps/api/`. It has no frontend, account system, or browser-side database access. P5 ledger reads remain private; P6 adds a separate opt-in public receipt JSON route described in [`evidence-receipts.md`](evidence-receipts.md).

## Canonical Evidence Mapping

`LimenDecisionResult` remains the only decision representation. Each item in `LedgerRunIngest.decisions` is the exact canonical result produced by P1:

| Canonical field | Ledger column |
|---|---|
| `id` | `decisions.decision_id` |
| `decision` | `decisions.decision` |
| `reasonCode` | `decisions.reason_code` |
| `summary` | `decisions.summary` |
| `cveId` | `decisions.cve_id` |
| `repositoryEvidence` | `decisions.repository_evidence` JSONB |
| `telegraphEvidence` | `decisions.telegraph_evidence` JSONB |
| `checks` | `decisions.checks` JSONB |
| `evaluatedAt` | `decisions.evaluated_at` |
| `policyVersion` | `decisions.policy_version` |

The `runs` row is an envelope for GitHub context, aggregate counts, policy version, timestamps, usage classification and the existing aggregate result. It does not replace or reinterpret the per-decision object.

## Database Schema

Migration: `supabase/migrations/20260902000000_create_evidence_ledger.sql`

### `runs`

Stores one release-check execution: repository, PR number, base/head SHAs, GitHub run ID and attempt, event, actor, policy version, aggregate `PASS`/`HOLD`/`REVIEW`, run reason and summary, decision counts, evaluated/skipped CVE arrays, Telegraph count/cost, timestamps, `is_test`, `usage_class`, and `source`.

`(github_run_id, github_run_attempt)` is unique, and `payload_hash` rejects altered child evidence under an existing execution identity. The public-safe `id` is `LM-RUN-...` and is the stable retrieval key.

### `decisions`

Stores one row per canonical `LimenDecisionResult`, linked to `runs(id)` with cascade delete. `(run_id, decision_id)` is unique. Repository and Telegraph evidence remain source-separated JSONB values. Historical backfills may explicitly represent unknown per-decision evaluation time as `evaluatedAt: null`; live Action-generated decisions must include it.

### `telegraph_requests`

Stores one row per actual unique Telegraph request: CVE, `CVE_LOOKUP`, Miner provenance, cost, duration, network, payment scheme, request/response timestamps, outcome and optional settlement reference. `requestedAt` is required for `source=action` records. Historical `source=backfill` records may use `null` when the original per-request time was not preserved; no timestamp is inferred from run timing. `(run_id, cve_id)` is unique for V1 because the Action deduplicates one paid lookup per CVE within a run.

No table has columns for private keys, wallet credentials, GitHub tokens, authorization headers, `PAYMENT-SIGNATURE`, or raw reusable payment proof.

RLS is enabled on all three tables. No anonymous or authenticated insert/read policies are created. The backend uses the Supabase service role server-side; direct client access is not part of P5.

## Ingest Contract

The shared contract is in `packages/ledger/src/`:

```typescript
interface LedgerRunIngest {
  run: LedgerRunMetadata;
  decisions: LimenDecisionResult[];
  telegraphRequests: SafeTelegraphRequestRecord[];
}
```

The runtime validator uses strict Zod schemas and rejects malformed repositories, SHAs, decisions, reason codes, timestamps, CVE IDs, counts, costs, usage classes and Telegraph records. It also checks that aggregate counts, policy versions, decision IDs, Telegraph CVE records and `isTest` agree with the package. Action request records must include `requestedAt`, and Action decisions must include `evaluatedAt`; backfill records may explicitly preserve either unknown time as `null`.

Forbidden credential-like keys are rejected recursively, including `privateKey`, `private_key`, `seed`, `mnemonic`, `paymentSignature`, `paymentProof`, `authorization`, `githubToken`, `token`, and service-role key variants. Safe string redaction still runs before storage so header-like values inside a permitted raw provider string are not retained.

## API Boundary

The API exposes two authenticated backend routes:

```text
POST /v1/ledger/runs
GET  /v1/ledger/runs/:id
```

Both require `Authorization: Bearer <LIMEN_INGEST_TOKEN>`. This is machine-to-machine ingestion authentication, not user authentication. The API returns only safe typed errors and never echoes the token or request body.

`POST` returns `{ "id": "LM-RUN-...", "created": true|false }`. A retry for the same GitHub run identity returns the existing ID with `created: false`.

`GET` is backend-authenticated and returns the run envelope, canonical decisions and safe Telegraph request records. It is not a public receipt endpoint; P6's separate receipt route owns public shareable projections.

## Atomic Persistence

`SupabaseEvidenceLedger.persistRun` calls the `persist_limen_run(jsonb)` Postgres function. The function inserts the parent run and both child collections in one transaction. A database error rolls back the complete package rather than leaving a partial run.

If `(github_run_id, github_run_attempt)` already exists, the function returns the existing ID for an equivalent retry. A conflicting repository, head SHA, policy, aggregate decision or requested ID raises an idempotency conflict instead of silently overwriting evidence.

## Idempotency

- GitHub run identity is `(githubRunId, githubRunAttempt)`.
- Canonical decision identity is `(run_id, decision_id)`.
- Telegraph request identity is `(run_id, cveId)` in V1.
- The Action records a single request record for each actual selected CVE attempt, including a safe failed outcome when a lookup was attempted but failed.
- No payment or provider request is retried by the ledger layer.

## Action Integration

The Action inputs are optional:

| Side | Variable/input | Owner |
|---|---|---|
| Action | `ledger-url` / `LIMEN_LEDGER_URL` | Consuming repository |
| Action | `ledger-token` / `LIMEN_LEDGER_TOKEN` | Consuming repository secret/configuration |
| Action | `usage-class` / `LIMEN_USAGE_CLASS` | Consuming repository; defaults to `production` |
| Backend | `LIMEN_INGEST_TOKEN` | Limen backend only |
| Backend | `SUPABASE_URL` | Limen backend only |
| Backend | `SUPABASE_SERVICE_ROLE_KEY` | Limen backend only |

Both Action ledger values are required to enable persistence. If neither is present, the Action continues normally and the summary says `Evidence ledger: not configured`. If only one is present, it emits a ledger-only warning and continues. A URL/network/API failure emits `Evidence ledger: persistence failed` and continues.

The release decision is calculated first and remains authoritative. Ledger persistence never changes `PASS`, `HOLD` or `REVIEW`, never changes the Action exit status, and never exposes the ingest token. Successful persistence adds `ledger-run-id` and `ledger-persisted=true` outputs plus the run ID to the job summary.

## Telegraph Provenance

The Action derives `SafeTelegraphRequestRecord` from the existing normalized `TelegraphCveEvidence`. It retains Intent, Miner ID/name, cost, duration, network, scheme and timestamps. The current Telegraph client does not expose a safe settlement transaction reference in its public evidence contract, so `settlementReference` remains `null`; P5 does not redesign x402 internals to force this field. Historical sanitized backfills may explicitly represent unknown Telegraph request timing as `null` in both the request record and canonical decision evidence. Current Action-generated evidence must include request timing and does not replace unknown values with run start or completion times.

The canonical Telegraph `raw` field crosses the validation boundary only after existing redaction, but the Postgres repository/function replace it with `null` before storage. P5 retains normalized Telegraph evidence, not a raw provider-response archive; forbidden credential-bearing fields are rejected before persistence.

## Usage Classification

Every package carries both `usageClass` and `isTest`. `isTest` must be true for `demo`, `development` and `test`, and false for `production`. Metrics must filter by `usage_class`; the R0 demo records are explicitly `source=backfill`, `usageClass=demo` and therefore are not external maintainer adoption.

P5 does not expose a dashboard. A future backend read model may query total runs, unique repositories, decision counts, paid requests, USDC cost, latency and Miner distribution while keeping non-production traffic separate.

## R0 Backfill

`backfillSanitizedRun` is an explicit import boundary for already-sanitized historical records. It requires `source=backfill` and `usageClass=demo`; it is not called automatically. A local operator may construct sanitized packages from the accepted R0 HOLD and PASS evidence and submit them only after configuring a real Supabase project.

The accepted live proof remains external to the ledger implementation:

- HOLD: `https://github.com/kaelah971/limen-demo/actions/runs/33654301781`
- PASS: `https://github.com/kaelah971/limen-demo/actions/runs/33655468552`

P5 does not claim those historical runs were automatically persisted live.

## P5.1 Live Validation

Manual validation against the hosted Supabase project named Limen confirmed
that all three migrations are applied and Local = Remote, including the two
additive nullable-timestamp migrations. Authenticated API validation confirmed
missing-token `401`, wrong-token `401`, and valid-token invalid-payload `400`
behavior. Sanitized demo/backfill HOLD and PASS records persisted and were
retrieved by their stable `LM-RUN-*` IDs.

The HOLD record round trip preserved five decisions, five Telegraph request
records, `$0.05` total cost, and Miner provenance. The PASS record preserved
zero decisions, zero Telegraph request records, and zero cost. Exact duplicate
HOLD ingest returned the existing ID with `created=false`. A same-execution
payload conflict returned `409 LEDGER_IDEMPOTENCY_CONFLICT`, and the stored
HOLD record remained unchanged.

A synthetic prohibited `privateKey` field was rejected with `400` and created
no row. Hosted inspection confirmed RLS enabled on all three tables and no
rows in `pg_policies`, so no anonymous/public policies or anonymous INSERT
policy exist. All imported records are explicitly `usageClass=demo`,
`source=backfill`, and `isTest=true`; they are not organic external adoption.

Historical R0 request `requestedAt` and per-decision `evaluatedAt` values that
were not preserved remain explicitly `null`. Current Action-generated records
must still include request timing and decision evaluation timing. No historical
timestamps were fabricated or inferred.

## Local Setup

Without a configured Supabase project, P5 is verified through strict contract tests, API boundary tests, repository mocks and migration inspection. No live database verification or fabricated backfill is performed.

Manual provisioning requires:

1. Create a Supabase project.
2. Apply `supabase/migrations/20260902000000_create_evidence_ledger.sql` with the Supabase migration tooling.
3. Run the backend with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `LIMEN_INGEST_TOKEN` set server-side.
4. Configure consuming Actions with `LIMEN_LEDGER_URL` and `LIMEN_LEDGER_TOKEN`, or the equivalent Action inputs.
5. Treat R0 backfill as a separately authorized `source=backfill`, `usageClass=demo` operation.

Run the small API locally with `npm run api:dev` after the server-only variables are set.
