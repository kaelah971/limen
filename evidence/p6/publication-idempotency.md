# Receipt Publication Idempotency

The same HOLD ledger run was published a second time after its initial
publication.

Ledger run: `LM-RUN-12EBDEF224C44BDCB1B34740`

Duplicate publication result:

- HTTP status: `200`
- Receipt ID: `LM-REC-B1306724D0B84B6EBDDF7E36`
- Snapshot hash: `41cbf844690a2a15bf6d7d0fdc6bfd8bf8ae08cd684d735eb611d069f3ffebdf`
- `publishedAt`: `2026-09-03T14:33:01.487214+00:00`
- `created`: `false`

The duplicate returned the exact original receipt ID, snapshot hash, and
publication timestamp. The receipt table count remained two rows before
revocation, confirming that the retry did not insert another receipt.

This proves publication idempotency for an unchanged snapshot. It does not
claim that a revoked receipt can be restored; the PASS receipt remained
revoked after its validation.
