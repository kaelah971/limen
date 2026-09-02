# Limen P0/P1/P2/P4 Security Model

P0 protects the external payment/evidence boundary. P1 keeps the decision evaluator pure. P2 treats repository policy as untrusted configuration. P4 adds read-only GitHub ingestion without persistence or release authentication.

## Secrets

`TELEGRAPH_PRIVATE_KEY` is loaded from the environment and used to construct an in-memory viem account. The key is not written to files, logs, normalized evidence, or error details. Payment signatures and reusable payment proof are never returned by the public Limen contracts.

The redactor removes private keys, seed material, payment signatures, payment proofs, authorization credentials, and token-like secret fields recursively. It preserves safe audit fields such as `miner_id`, `miner_name`, `CVE_LOOKUP`, cost, duration, network, scheme, and timestamps.

`GITHUB_TOKEN` is optional and is used only for GitHub request authorization. It is not included in normalized evidence, request metadata, typed error details, or response-shape diagnostics. GitHub API error bodies are reduced to safe status/body-type metadata rather than copied into errors.

## Network Safety

The expected network defaults to Base Sepolia (`eip155:84532`). Every accepted x402 challenge is checked against the configured network and `exact` scheme before payment construction. A mainnet or otherwise unexpected challenge fails with `UNEXPECTED_NETWORK`; there is no silent fallback.

Payment recipient and amount come from the live challenge. Catalog data is not used as an authorization source, and the client does not hardcode `payTo`.

## External Data

Telegraph responses are treated as untrusted `unknown` data and normalized defensively. Missing optional fields remain visible as `null` or `[]`. Malformed response shapes, unexpected Intents, transport failures, challenge failures, payment failures, and response failures use classified errors. No external `200` status is interpreted as a Limen decision.

GitHub responses are also untrusted. Zod schemas validate Dependency Review, Global Advisory, and Dependabot shapes before normalization. HTTP `401`, permission `403`, rate-limit `403/429`, missing advisories, malformed bodies, snapshot warnings, package identity conflicts, severity conflicts, and ambiguous evidence use distinct typed errors or explicit uncertainty. The adapter never infers a CVE, installed version, fix, scope, relationship, or authoritative clean result from missing data.

GitHub requests are restricted to `GET` operations. Repository owner, name, GHSA identifiers, and revision values are validated or encoded before URL construction. Timeouts use an abort signal, and rate-limit remaining/reset values plus GitHub request IDs are retained as non-secret metadata.

## Policy Configuration

`limen.yml` is parsed with a mature YAML library using core schema semantics and duplicate-key rejection. P2 permits only the bounded snake_case policy shape, rejects unknown keys and unsupported values, does not execute tags or expand environment values, and requires explicit risk appetite fields. Uncertainty settings safely default to `review`. Policy versions hash canonical effective content rather than source formatting.

## Future Controls

P1 ensures that repository policy, identity conflicts, severity conflicts, and missing evidence resolve deterministically to `PASS`, `HOLD`, or `REVIEW`. Later GitHub Action and ledger milestones must add least-privilege installation permissions, webhook/request authenticity, idempotency, durable redacted evidence, and explicit separation of test traffic from real user usage.
