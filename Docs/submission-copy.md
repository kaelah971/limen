# Submission Copy

## A. One-Line Description

Limen is a release evidence gate combining GitHub repository context, routed Telegraph CVE evidence, and deterministic policy.

## B. Short Description

Limen evaluates dependency-sensitive pull requests before release. It combines repository-specific GitHub evidence with routed Telegraph `CVE_LOOKUP` results, then applies the trusted base-branch `limen.yml` policy to return deterministic `PASS`, `HOLD`, or fail-closed `REVIEW`. Fresh Judge Mode proof shows paid lookups only when relevant CVEs exist.

## C. Full Description

Release automation often has two incomplete views: CI knows whether tests passed, while a vulnerability source knows general vulnerability facts. Neither alone answers whether this repository's proposed release should proceed under its own policy.

Limen is a release evidence gate for dependency-sensitive pull requests. It reads repository and advisory facts through read-only GitHub APIs, retrieves the policy from the trusted pull request base SHA, routes relevant CVE lookups through Telegraph, and evaluates the combined evidence with a deterministic decision engine. `PASS` means available evidence supports proceeding. `HOLD` means repository-specific evidence matches a blocking policy condition. `REVIEW` means evidence is missing, conflicting, malformed, unavailable, or unresolved, and never silently becomes approval.

Telegraph matters because it provides a separately routed second evidence source with `CVE_LOOKUP` intent, Miner provenance, cost, latency, network, and payment metadata. The validated x402 flow uses HTTP `402`, Base Sepolia, an exact payment scheme, and a bounded retry. Telegraph supplies evidence; it does not decide whether a repository is exploitable.

The fresh controlled Judge Mode vulnerable path (`lodash@4.17.20`) produced `HOLD` after five paid lookups with known `$0.05` cost. The controlled patched path (`lodash@4.18.1`) produced `PASS` with `NO_RELEVANT_VULNERABILITY`, zero lookups, and known `$0.00` cost. These are controlled proof runs, not production adoption or universal safety claims.

Limen also includes separately validated optional hosted ledger and public receipt infrastructure. That path provides durable sanitized evidence and snapshot integrity checking without becoming release authority.

## D. Telegraph Integration Answer

Telegraph is materially part of Limen's evidence path. For each bounded relevant CVE, Limen sends `CVE_LOOKUP` to the Telegraph Engine, validates the HTTP `402` challenge, uses the official x402 EVM flow on Base Sepolia with an exact scheme, retries with `PAYMENT-SIGNATURE`, and requires the returned intent to remain `CVE_LOOKUP`. Safe provenance, cost, latency, network, and scheme metadata are preserved when available. Transport, payment, routing, and response failures become `REVIEW`, not silent `PASS`.

## E. Tech Stack

- TypeScript and Node.js
- GitHub REST APIs and GitHub Actions
- Telegraph Engine and x402 EVM payment flow
- Zod schemas and deterministic policy evaluation
- Next.js web product
- Node.js ledger API
- Supabase/Postgres for optional server-owned persistence and receipts
- Vercel deployments for the public web and API surfaces

## F. Live Links

- Product: https://limen-mu.vercel.app
- Demo: https://limen-mu.vercel.app/demo
- Setup: https://limen-mu.vercel.app/setup
- Proof lookup: https://limen-mu.vercel.app/proof
- Active receipt: https://limen-mu.vercel.app/receipt/LM-REC-B1306724D0B84B6EBDDF7E36
- API receipt JSON: https://limen-api-one.vercel.app/v1/receipts/LM-REC-B1306724D0B84B6EBDDF7E36

## G. Limitations

- Telegraph execution is controlled Base Sepolia testnet validation.
- Current evidence is controlled/demo evidence, not production adoption.
- External maintainer testing remains pending.
- The shared ledger token is single-operator, not multi-tenant authorization.
- P14 Judge Mode runs were not automatically persisted to receipt infrastructure.
- Receipt SHA-256 is integrity checking, not a digital signature or non-repudiation.
- The current Telegraph HTTP Engine endpoint is an explicit testnet exception.
- `PASS` does not mean universal repository security.

## H. Demo Video Placeholder

Loom URL: to be added manually after recording. No video URL is being invented here.

## I. GitHub Links

- Limen repository: https://github.com/kaelah971/limen
- Controlled demo repository: https://github.com/kaelah971/limen-demo
- Demo PR #1: https://github.com/kaelah971/limen-demo/pull/1
- Current Action SHA: `a91d36bfe8eaab5d95f791e39449878239bf948d`

## J. Proof Links

- Fresh HOLD: https://github.com/kaelah971/limen-demo/actions/runs/33958836557
- Fresh PASS: https://github.com/kaelah971/limen-demo/actions/runs/33959096100
- Historical R0 validation: [`Docs/validation-reference.md`](validation-reference.md)
- P5 ledger validation: [`evidence/p5/README.md`](../evidence/p5/README.md)
- P6 receipt validation: [`evidence/p6/README.md`](../evidence/p6/README.md)
- Final local verification: [`evidence/final-verification.md`](../evidence/final-verification.md)
