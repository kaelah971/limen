# Limen Evidence Receipts

P6 adds an explicit, server-owned public projection of a persisted Limen run. A
receipt is not a second decision format and it does not make a private ledger
run public automatically. The operator must publish a receipt for a specific
ledger run.

## Architecture

```text
Authenticated operator/API client
    |
    | POST /v1/receipts { runId }
    v
Limen API
    |
    | authenticated server-side ledger read
    | allowlist projection + canonical JSON + SHA-256
    v
Supabase
    |
    +--> receipts (private storage, service role only)

Public reader
    |
    | GET /v1/receipts/:receiptId
    v
Safe active receipt JSON, or 410 after revocation
```

The publication endpoint accepts only a ledger run ID. Clients cannot submit
or replace the public snapshot. The API loads the authoritative
`PersistedRunDetail`, projects it with `projectReceiptSnapshot`, hashes that
projection, and sends the result to the server-only receipt repository.

The receipt package is under `packages/receipts/` and is server-only. It is not
imported by the GitHub Action or browser code. P6 does not add a web UI,
account authentication, billing, automatic publication, or a public database
policy.

## Public Contract

The active receipt object has this shape:

```typescript
interface LimenEvidenceReceipt {
  id: `LM-REC-*`;
  schemaVersion: "limen.receipt.v1";
  snapshotHash: string; // lowercase SHA-256 of canonical snapshot JSON
  publishedAt: string;
  snapshot: ReceiptSnapshot;
}
```

The versioned snapshot contains:

- release repository, PR, base/head SHAs, event, actor and timing;
- aggregate `PASS`, `HOLD` or `REVIEW`, reason, summary and counts;
- policy version and usage classification/source;
- repository exposure evidence;
- normalized Telegraph `CVE_LOOKUP` evidence, Miner name, cost, latency,
  network, payment scheme and request timing;
- decision checks and per-decision evaluation time;
- the actual Telegraph request records.

Unknown historical request or evaluation times remain `null`. R0 backfills
remain visibly `usageClass=demo` and `source=backfill`.

The projector is an allowlist. It deliberately excludes decision IDs, Miner
IDs, provider endpoints, settlement references, raw provider payloads, private
keys, wallet credentials, payment signatures/proofs, authorization data,
tokens and other internal storage fields. It does not infer or replace missing
evidence.

## Hashing

`canonicalizeJson` sorts object keys recursively, preserves array order, uses
JSON string escaping, and rejects unsupported values. `hashReceiptSnapshot`
calculates the lowercase SHA-256 digest of that canonical UTF-8 JSON. The
receipt ID, publication time and revocation time are metadata and are not part
of the snapshot hash, so equivalent projections produce the same hash.
This is a tamper-evident integrity check for the snapshot, not a digital
signature, publisher authentication, or non-repudiation mechanism.

## API Boundary

```text
POST /v1/receipts
Authorization: Bearer <LIMEN_INGEST_TOKEN>
{ "runId": "LM-RUN-..." }

GET /v1/receipts/LM-REC-...

POST /v1/receipts/LM-REC-.../revoke
Authorization: Bearer <LIMEN_INGEST_TOKEN>
```

Publication is idempotent per ledger run. Repeating a publication for the same
unchanged snapshot returns the existing receipt with `created=false`. A
different snapshot or schema conflicts with `409`; the server never overwrites
an existing receipt. A revoked receipt cannot be republished.

Public retrieval requires no bearer token because the receipt is intentionally
shareable. An active receipt returns `200`. A missing ID returns `404`. A
revoked receipt returns `410` with only a safe revocation error and never the
stored snapshot. Revocation itself is authenticated and idempotent.

## Database Security

Migration:
`supabase/migrations/20260902030000_create_evidence_receipts.sql`

The `receipts` table has one row per ledger run, a versioned JSONB snapshot, a
SHA-256 hash, publication time and optional revocation time. It is linked to
`runs(id)` and has no anonymous or authenticated RLS policies. Only the
server-side Supabase service role can access the table or execute the
publication/revocation functions.

The public HTTP route is the only public access path. The migration is applied
to the dedicated hosted project used for P6.1 live validation. Implementation
and local tests do not publish demo/backfill records or write to the hosted
database. The supplied live evidence package is at
[`evidence/p6/README.md`](../evidence/p6/README.md).

## P6.1 Live Verification

P6 receipt infrastructure is live-verified against the dedicated hosted
Supabase project ref `epmpciglqswrahgvbchz`. The validation published and
retrieved both a controlled HOLD receipt and a controlled PASS receipt without
authentication on the public GET route. It also demonstrated publication
idempotency, `401` protection for private ledger retrieval, `404` handling for
an unknown receipt, receipt-table RLS with no public database policies, and
authenticated revocation with subsequent public `410 Gone` behavior.

The active canonical public demo receipt is
`LM-REC-B1306724D0B84B6EBDDF7E36`, for ledger run
`LM-RUN-12EBDEF224C44BDCB1B34740`. Its snapshot hash is
`41cbf844690a2a15bf6d7d0fdc6bfd8bf8ae08cd684d735eb611d069f3ffebdf` and its
`publishedAt` is `2026-09-03T14:33:01.487214+00:00`.

The PASS validation receipt
`LM-REC-1463B3EF54DC4CA3827ED3DC` was intentionally revoked after its public
round trip. Its immutable snapshot hash and publication timestamp were
preserved, and its public route now returns `410 Gone`. This does not mean the
underlying PASS evidence was invalid. Both records are `usageClass=demo` and
`source=backfill`; this is not production adoption, external-user activity, or
mainnet Telegraph activity.

## P6/P6.1 Boundary

Included:

- versioned public receipt schema;
- server-side allowlist projection;
- deterministic canonical hashing;
- authenticated publication and revocation;
- public JSON retrieval;
- idempotency, hash integrity, revocation and secret-exclusion tests.
- live hosted publication, retrieval, boundary, RLS and revocation validation.

Deferred:

- `/r/:id` rendered web UI;
- receipt search, dashboards and account access;
- automatic Action publication;
- organic/external usage and adoption evidence;
- billing, retention policy and organization controls.
