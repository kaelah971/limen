# PASS Receipt Round Trip

The PASS receipt was published and retrieved publicly before being intentionally
revoked as the live revocation-validation target.

Ledger run: `LM-RUN-346D6B341BEF4E648AFED751`

Published receipt metadata:

- Receipt ID: `LM-REC-1463B3EF54DC4CA3827ED3DC`
- Schema version: `limen.receipt.v1`
- Snapshot hash: `9ff2a5b271a1511267310ad70d919e2e05edcbf2119532cc2c4fec0a8c62ab61`
- `publishedAt`: `2026-09-03T14:38:57.39233+00:00`
- Initial publication: HTTP `200`, `created=true`

Public retrieval succeeded without authentication and returned this public-safe
PASS snapshot before revocation. Observed values:

- Repository: `kaelah971/limen-demo`
- Pull request number: `1`
- Base SHA: `2f2cd0bbcffd00c562c82d834fe2669afc3352f7`
- Head SHA: `394d98d9d8aac8c02134abda6db4116b3f64c7ee`
- GitHub event: `pull_request`
- Actor: `kaelah971`
- Policy version: `LP-fde4ac5cdba2`
- Overall decision: `PASS`
- Run reason code: `NO_RELEVANT_VULNERABILITY`
- Run summary: `No blocking dependency vulnerability was introduced by this pull request.`
- Decision count: `0`
- PASS count: `0`
- HOLD count: `0`
- REVIEW count: `0`
- Telegraph request count: `0`
- Telegraph cost: `$0`
- Evaluated CVEs: `[]`
- Skipped CVEs: `[]`
- Usage class: `demo`
- Source: `backfill`
- Decisions: `[]`
- Telegraph requests: `[]`

No private ledger-only fields or secrets appeared in the observed public
projection. After the separate revocation check, public retrieval correctly
returned HTTP `410`; see [`revocation.md`](revocation.md). The receipt is not
active now.
