# Receipt Migration Validation

`supabase migration list` against the dedicated hosted Limen project confirmed
Local = Remote for all four applied migrations:

| Local migration | Remote migration | Result |
|---|---|---|
| `20260902000000_create_evidence_ledger.sql` | `20260902000000_create_evidence_ledger.sql` | matched |
| `20260902010000_allow_null_backfill_telegraph_requested_at.sql` | `20260902010000_allow_null_backfill_telegraph_requested_at.sql` | matched |
| `20260902020000_allow_null_backfill_decision_evaluated_at.sql` | `20260902020000_allow_null_backfill_decision_evaluated_at.sql` | matched |
| `20260902030000_create_evidence_receipts.sql` | `20260902030000_create_evidence_receipts.sql` | matched |

The newest applied migration is
`20260902030000_create_evidence_receipts.sql`.

No Supabase CLI update was performed merely because the CLI printed an
available-update notice.
