# P5.1 Live Ledger Validation

This package records the manual validation of the Limen evidence ledger against
the hosted Supabase project named Limen. It contains only public-safe facts and
sanitized summaries. It is not an adoption or usage report.

Validation scope:

- migration and schema state
- ingest authentication
- sanitized HOLD persistence and retrieval
- sanitized PASS persistence and retrieval
- duplicate ingest idempotency
- immutable-history conflict protection
- synthetic credential rejection
- RLS and policy state

All imported records are explicitly classified as `usageClass=demo` and
`source=backfill`, with `isTest=true`. They must not be counted as organic
external adoption.

No new Telegraph request, database write, or R0 backfill was performed while
assembling this package.

Files:

- `migration-validation.md`
- `live-ledger-validation.md`
- `hold-round-trip.md`
- `pass-round-trip.md`
- `idempotency-conflict.md`
- `security-validation.md`
