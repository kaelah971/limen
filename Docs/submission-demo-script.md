# Submission Demo Script

Target runtime: 2 to 4 minutes. This is a conversational walkthrough, not an advertisement. Use only the existing public links and existing Judge Mode runs.

## 0:00-0:20 - Landing page

Open the [live product](https://limen-mu.vercel.app).

> Limen is a release evidence gate. It asks whether a release has enough trusted evidence to leave the repository, not just whether the test command passed.

## 0:20-0:45 - The evidence boundary

Show the [architecture diagram](../public/limen-architecture.svg) or the live product navigation.

> GitHub establishes repository-specific dependency context. Telegraph supplies separately routed CVE evidence through `CVE_LOOKUP`. The repository's `limen.yml` policy and Limen's deterministic engine decide `PASS`, `HOLD`, or `REVIEW`. Telegraph does not decide exploitability, and the optional ledger does not control release authority.

## 0:45-1:15 - Vulnerable path

Open [Demo PR #1](https://github.com/kaelah971/limen-demo/pull/1) and point to the controlled vulnerable dependency path: `lodash@4.17.20`.

> This is a controlled fixture. It is not a claim about production adoption or universal package safety.

## 1:15-1:50 - Fresh HOLD

Open [HOLD run 33958836557](https://github.com/kaelah971/limen-demo/actions/runs/33958836557).

Show the `HOLD` result, the five paid `CVE_LOOKUP` requests, known `$0.05` cost, Base Sepolia network, exact payment scheme, routed evidence, and blocking policy reason.

> The workflow is expected to fail here because `HOLD` is the release-blocking result. A failed workflow is the correct outcome for this decision.

## 1:50-2:10 - REVIEW boundary

> `REVIEW` is different from `PASS`. Missing, conflicting, malformed, unavailable, or unresolved evidence fails closed and requires investigation. Setup or provider failure is not silently converted into release approval.

## 2:10-2:35 - Patched path and PASS

Open [PASS run 33959096100](https://github.com/kaelah971/limen-demo/actions/runs/33959096100).

Show the controlled patched fixture `lodash@4.18.1`, `PASS`, reason `NO_RELEVANT_VULNERABILITY`, zero Telegraph requests, and known `$0.00` cost.

> This run shows the result for this controlled fixture. It does not claim that the package version is universally safe.

## 2:35-3:00 - Historical receipt

Open the [active public HOLD receipt](https://limen-mu.vercel.app/receipt/LM-REC-B1306724D0B84B6EBDDF7E36).

> This is a separate historical P5/P6 evidence chain. The ledger was live-validated, the public object is a sanitized projection, and its SHA-256 hash checks snapshot integrity. The P14 Judge Mode runs did not automatically create receipts.

## 3:00-3:20 - Close

> Your CI already asks whether the tests passed. Limen asks whether this release has enough trusted evidence to leave the repository.
