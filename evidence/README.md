# Limen Proof Index

This is a compact index of the evidence behind the judge-facing submission. It links to the existing records and labels each evidence chain separately. Controlled/demo evidence is not adoption evidence.

## Quick Links

- [Live product](https://limen-mu.vercel.app)
- [Live demo](https://limen-mu.vercel.app/demo)
- [Active public HOLD receipt](https://limen-mu.vercel.app/receipt/LM-REC-B1306724D0B84B6EBDDF7E36)
- [Fresh Judge Mode HOLD](https://github.com/kaelah971/limen-demo/actions/runs/33958836557)
- [Fresh Judge Mode PASS](https://github.com/kaelah971/limen-demo/actions/runs/33959096100)
- [Demo PR #1](https://github.com/kaelah971/limen-demo/pull/1)

## Evidence Chains

| Milestone | What it proves | Classification | Relevant links |
|---|---|---|---|
| R0 - paid validation | The Telegraph Engine boundary handled HTTP `402`, official x402 EVM payment, Base Sepolia settlement, HTTP `200` retry, and routed CVE evidence. | Historical paid validation; controlled/demo reference | [`Docs/validation-reference.md`](../Docs/validation-reference.md) |
| P5 - hosted ledger | Sanitized HOLD/PASS persistence, authenticated ledger access, idempotency, conflict protection, credential rejection, RLS, and migration state. | Hosted controlled validation; `usageClass=demo`, `source=backfill`, `isTest=true` | [`evidence/p5/README.md`](p5/README.md) |
| P6 - public receipts | Allowlist projection, canonical SHA-256 hashing, public retrieval, private ledger separation, idempotency, and authenticated revocation with public `410 Gone`. | Hosted controlled validation; `usageClass=demo`, `source=backfill` | [`evidence/p6/README.md`](p6/README.md), [active receipt](https://limen-mu.vercel.app/receipt/LM-REC-B1306724D0B84B6EBDDF7E36) |
| P9 - demo repository | A public repository and PR provide a reproducible, inspectable fixture for the release gate. | Controlled demo fixture; not adoption | [Demo repository](https://github.com/kaelah971/limen-demo), [PR #1](https://github.com/kaelah971/limen-demo/pull/1) |
| P14 - Judge Mode | Fresh hardened HOLD and PASS behavior using the current Action reference, including paid lookups only on the vulnerable path. | Fresh controlled Judge Mode evidence; not production adoption | [HOLD run](https://github.com/kaelah971/limen-demo/actions/runs/33958836557), [PASS run](https://github.com/kaelah971/limen-demo/actions/runs/33959096100) |

## P14 Labels

- Vulnerable fixture: `lodash@4.17.20`, five paid `CVE_LOOKUP` requests, known cost `$0.05`, Base Sepolia, result `HOLD`.
- Patched fixture: `lodash@4.18.1`, zero Telegraph requests, known cost `$0.00`, result `PASS` with `NO_RELEVANT_VULNERABILITY`.
- The HOLD workflow fails because `HOLD` is a blocking release decision. The PASS workflow succeeds.
- P14 did not automatically publish a receipt. The public receipt linked above is the historical P6 active HOLD projection.

## Boundaries

- Telegraph supplies routed CVE evidence; it does not decide repository exploitability.
- The Limen policy and deterministic decision engine decide `PASS`, `HOLD`, or `REVIEW`.
- The ledger and receipts are optional durability and presentation paths, separate from release authority.
- No item in this index claims production adoption, external users, mainnet activity, universal safety, decentralized consensus, or a signed receipt.
