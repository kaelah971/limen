# Limen Observability

Limen emits structured lines prefixed with `LIMEN_OBSERVABILITY`. The Action
summary also includes a compact execution-stage table. Observability describes
what happened; it does not change the `PASS`, `HOLD`, or `REVIEW` decision.

## Correlation

Action events use the existing `limenRunId` together with available GitHub
context: `githubRunId`, `githubRunAttempt`, `repository`,
`pullRequestNumber`, `baseSha`, `headSha`, and `policyVersion`. API request
events use a local `requestId` and a route template such as
`/v1/receipts/:id`. A request ID is returned in the `x-request-id` response
header.

## Stages

Meaningful Action stages emit `START` and a terminal `SUCCESS` or `FAILURE`
event: event validation, policy retrieval/parsing, Dependency Review, advisory
enrichment, finding selection, Telegraph initialization and lookup, decision
evaluation, aggregate decision, summary output, ledger persistence, and final
workflow result. Dependency Review retry events include the current attempt,
maximum attempts, retry count, and safe error classification.

## Safe Fields

Events may include timestamps, stage outcome, CVE, intent, Miner name, cost
when known, provider duration when supplied, local `durationMs`, network,
payment scheme, request timestamps, HTTP status, request count, and safe error
or reason codes. Unknown cost is represented as `null` or omitted and is never
rendered as zero. `durationMs` is local Limen timing; `providerDurationMs` is
used only when the provider supplied a duration.

Every structured event passes through the shared redaction and Zod
serialization boundary. Events never contain GitHub tokens, Telegraph private
keys, ledger tokens, Supabase service-role keys, authorization headers,
`PAYMENT-SIGNATURE`, signed payment payloads, reusable payment proofs, or raw
provider bodies.

## Ledger and API

Ledger telemetry reports configured, partial, skipped, successful, and failed
persistence outcomes. Persistence emits `START` and terminal events; terminal
events include local duration and safe error metadata. Persistence remains
non-fatal and never changes the release decision.

The API logs request ID, method, route template, status, duration, and safe
error code for the ledger and receipt routes. Request bodies and authorization
headers are not logged. Public active receipts remain readable without
authentication; unknown receipts return `404`, revoked receipts return `410`,
and private ledger routes continue to require authentication.
