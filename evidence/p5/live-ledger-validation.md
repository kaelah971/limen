# Live Ledger Validation

The locally running backend was tested against the hosted Limen Supabase
project at `http://127.0.0.1:8787`.

Authentication results:

- POST without an ingest token: `401`
- POST with the wrong token: `401`
- POST with the correct token and invalid `{}`: `400`

The `400` result proves the valid token reached request validation. No token
value is recorded here.

Database state after the controlled validation records:

- `runs`: 2
- `decisions`: 5
- `telegraph_requests`: 5

The records are controlled demo/backfill validation data, not organic usage.
