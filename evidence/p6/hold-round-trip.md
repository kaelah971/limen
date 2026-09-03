# HOLD Receipt Round Trip

The HOLD receipt was published and retrieved publicly from the dedicated
hosted Limen Supabase-backed API.

Ledger run: `LM-RUN-12EBDEF224C44BDCB1B34740`

Published receipt metadata:

- Receipt ID: `LM-REC-B1306724D0B84B6EBDDF7E36`
- Schema version: `limen.receipt.v1`
- Snapshot hash: `41cbf844690a2a15bf6d7d0fdc6bfd8bf8ae08cd684d735eb611d069f3ffebdf`
- `publishedAt`: `2026-09-03T14:33:01.487214+00:00`
- Initial publication: HTTP `200`, `created=true`

Public retrieval succeeded without authentication and returned the public-safe
receipt snapshot. Observed values:

- Overall decision: `HOLD`
- Decision count: `5`
- PASS count: `3`
- HOLD count: `1`
- REVIEW count: `1`
- Telegraph request count: `5`
- Telegraph cost: `$0.05`
- Usage class: `demo`
- Source: `backfill`

Historical unknown request and per-decision evaluation timestamps remained
`null`. The observed public projection did not contain a service-role key,
private key, ingestion token, payment signature, raw provider payload, private
ledger internals, or a Telegraph `minerId`.

This receipt remains active and is the canonical public demo receipt for this
checkpoint.
