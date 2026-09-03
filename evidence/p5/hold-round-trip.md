# HOLD Round Trip

Historical source facts:

- Repository: `kaelah971/limen-demo`
- Pull request: `1`
- GitHub run: `33654301781`
- Attempt: `1`
- Base SHA: `2f2cd0bbcffd00c562c82d834fe2669afc3352f7`
- Head SHA: `84bda870ae3b90713f3d3a01a4b6a50f647d98c3`
- Policy: `LP-fde4ac5cdba2`
- Overall decision: `HOLD`
- Usage class: `demo`
- Source: `backfill`
- Test classification: `isTest=true`

Stored ledger ID:

`LM-RUN-12EBDEF224C44BDCB1B34740`

Stored and retrieved values:

- Decision count: `5`
- PASS count: `3`
- HOLD count: `1`
- REVIEW count: `1`
- Telegraph request count: `5`
- Telegraph cost: `$0.05`
- Miner: `PREFLIGHT Infrastructure Signals`
- Per-request costs: `$0.01` each
- Per-request latencies: `1043 ms`, `561 ms`, `321 ms`, `557 ms`, `328 ms`

Decisions:

- `CVE-2021-23337`: `HOLD`, `AFFECTED_BLOCKING_DEPENDENCY`
- `CVE-2026-4800`: `REVIEW`, `SEVERITY_CONFLICT`
- `CVE-2020-28500`: `PASS`
- `CVE-2025-13465`: `PASS`
- `CVE-2026-2950`: `PASS`

The exact per-request `requestedAt` values and per-decision `evaluatedAt`
values were not preserved by R0 and remain explicitly `null`. No timestamps
were fabricated or inferred from run timing.

The round trip preserved the original HOLD result and all normalized counts,
cost, provenance, and classification.
