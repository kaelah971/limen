# Migration Validation

The repository was linked to the hosted Supabase project named Limen. The
Supabase CLI migration list confirmed Local = Remote for every P5 migration:

| Local migration | Remote migration | Result |
|---|---|---|
| `20260902000000_create_evidence_ledger.sql` | `20260902000000_create_evidence_ledger.sql` | matched |
| `20260902010000_allow_null_backfill_telegraph_requested_at.sql` | `20260902010000_allow_null_backfill_telegraph_requested_at.sql` | matched |
| `20260902020000_allow_null_backfill_decision_evaluated_at.sql` | `20260902020000_allow_null_backfill_decision_evaluated_at.sql` | matched |

Manual hosted database inspection confirmed the `runs`, `decisions`, and
`telegraph_requests` tables, their foreign keys, uniqueness constraints,
indexes, the `persist_limen_run` function, and RLS state.

The initial applied migration was not modified. No migration was applied while
assembling this evidence package.

The CLI linked schema lint and security advisor could not open the temporary
database role because `SUPABASE_DB_PASSWORD` was not available to the CLI.
This is an environment limitation, not a reported ledger schema failure. The
linked performance advisor reported no issues.
