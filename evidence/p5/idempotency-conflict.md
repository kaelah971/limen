# Idempotency and Conflict Protection

Exact duplicate ingest of the HOLD payload used the same GitHub run ID,
attempt, and payload hash.

Observed result:

- HTTP status: `200`
- Ledger ID: `LM-RUN-12EBDEF224C44BDCB1B34740`
- `created`: `false`
- Duplicate rows: none

A second request reused the same GitHub run ID and attempt but changed the run
summary to a synthetic conflict value.

Observed result:

- HTTP status: `409`
- Public error code: `LEDGER_IDEMPOTENCY_CONFLICT`
- Existing stored evidence: unchanged

The original record remained `HOLD`, retained its original summary, had five
Telegraph request records, cost `$0.05`, and remained classified as
`usageClass=demo`, `source=backfill`.

The database RPC continues to own immutable-history enforcement. The API fix
only maps the known RPC conflict to HTTP 409; it does not alter idempotency
semantics.
