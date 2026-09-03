# P6.1 Live Shareable Evidence Receipts

This package records the manual live validation of Limen's P6 shareable
evidence receipt infrastructure against the dedicated hosted Supabase project
named Limen (`epmpciglqswrahgvbchz`). It contains only the supplied public-safe
facts and sanitized observations. It is not a production adoption or usage
report.

Receipt contract:

- Schema version: `limen.receipt.v1`
- Receipt ID prefix: `LM-REC-`

Validation scope:

- HOLD receipt publication and public retrieval
- PASS receipt publication and public retrieval
- Publication idempotency for the same ledger run
- Public receipt versus private ledger separation
- Unknown receipt handling
- Receipt table counts before and after revocation
- RLS and absence of public database policies
- Revocation authentication and live revocation
- `410 Gone` behavior for a revoked receipt
- Local/remote Supabase migration synchronization
- Public-field allowlisting and secret exclusion

The canonical public demo receipt is the active HOLD receipt documented in
[`hold-round-trip.md`](hold-round-trip.md). The PASS receipt was intentionally
revoked after its public round trip to validate revocation; it was not revoked
because its underlying PASS evidence was invalid. It must not be described as
an active receipt.

All observed records are classified as `usageClass=demo` and `source=backfill`.
This validation does not demonstrate production adoption, external users,
mainnet Telegraph activity, or universal safety.

Files:

- [`hold-round-trip.md`](hold-round-trip.md)
- [`pass-round-trip.md`](pass-round-trip.md)
- [`publication-idempotency.md`](publication-idempotency.md)
- [`boundary-security.md`](boundary-security.md)
- [`revocation.md`](revocation.md)
- [`migration-validation.md`](migration-validation.md)

No credential values, private keys, service-role material, ingestion tokens,
payment signatures, authorization header values, or raw provider payloads are
included in this package.
