# Public Boundary and Security Validation

## Public/private separation

An unauthenticated request for the private ledger record returned HTTP `401`:

`GET /v1/ledger/runs/LM-RUN-346D6B341BEF4E648AFED751`

At the same time, public receipt retrieval succeeded without authentication.
The public receipt projection is therefore separate from the private ledger
record and does not make ledger runs publicly readable.

An unknown receipt ID returned HTTP `404`:

`GET /v1/receipts/LM-REC-AAAAAAAAAAAAAAAAAAAAAAAA`

The unknown-ID response did not expose private ledger information.

## Receipt table state before revocation

The hosted database query returned:

```text
receipts:         2
active_receipts:  2
revoked_receipts: 0
```

The two rows were the HOLD and PASS receipts. The counts also confirmed that
duplicate publication did not create a third row.

## RLS and database policies

Hosted SQL inspection confirmed:

- `public.receipts`: `rowsecurity=true`
- `pg_policies` query for `public.receipts`: success, no rows returned

There are no anonymous or public database policies on `receipts`. Public
access is provided by Limen's backend projection/API route rather than direct
anonymous Supabase table access.

## Public-field observations

The observed public snapshots contained the versioned release, decision,
normalized evidence, and safe request fields needed to explain the result.
They did not contain a service-role key, private key, ingestion token, payment
signature, raw provider payload, private ledger internals, or a Telegraph
`minerId` in the observed projection.

No credential values, authorization header values, or reusable private payment
proof are included in this evidence package.
