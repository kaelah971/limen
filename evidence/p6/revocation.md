# Live Receipt Revocation

Revocation authentication was tested before changing receipt state:

- POST revoke without authentication: HTTP `401`
- POST revoke with a definitely wrong bearer token: HTTP `401`

The PASS receipt was intentionally selected so the canonical active HOLD demo
receipt would remain available.

Authenticated request:

`POST /v1/receipts/LM-REC-1463B3EF54DC4CA3827ED3DC/revoke`

Observed response: HTTP `200`

```json
{
  "id": "LM-REC-1463B3EF54DC4CA3827ED3DC",
  "runId": "LM-RUN-346D6B341BEF4E648AFED751",
  "schemaVersion": "limen.receipt.v1",
  "snapshotHash": "9ff2a5b271a1511267310ad70d919e2e05edcbf2119532cc2c4fec0a8c62ab61",
  "publishedAt": "2026-09-03T14:38:57.39233+00:00",
  "revokedAt": "2026-09-03T14:49:27.297015+00:00",
  "created": true
}
```

The original receipt ID, snapshot hash, and publication timestamp were
unchanged. The revocation added `revokedAt`; immutable published evidence was
not rewritten or deleted.

Public retrieval of the revoked receipt subsequently returned HTTP `410 Gone`.
The response contained only the safe revocation error and did not return the
stored snapshot.

Final hosted receipt table state:

```text
receipts:         2
active_receipts:  1
revoked_receipts: 1
```

The active receipt is the HOLD receipt. The revoked receipt is the PASS
validation receipt. Its revocation was an intentional P6.1 lifecycle test, not
a finding that the underlying PASS evidence was invalid. No un-revocation was
attempted or added.
