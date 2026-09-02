# Limen P0/P1/P2 Security Model

P0 protects the external payment/evidence boundary. P1 keeps the decision evaluator pure. P2 treats repository policy as untrusted configuration and does not yet implement GitHub authentication, repository ingestion, or persistence.

## Secrets

`TELEGRAPH_PRIVATE_KEY` is loaded from the environment and used to construct an in-memory viem account. The key is not written to files, logs, normalized evidence, or error details. Payment signatures and reusable payment proof are never returned by the public Limen contracts.

The redactor removes private keys, seed material, payment signatures, payment proofs, authorization credentials, and token-like secret fields recursively. It preserves safe audit fields such as `miner_id`, `miner_name`, `CVE_LOOKUP`, cost, duration, network, scheme, and timestamps.

## Network Safety

The expected network defaults to Base Sepolia (`eip155:84532`). Every accepted x402 challenge is checked against the configured network and `exact` scheme before payment construction. A mainnet or otherwise unexpected challenge fails with `UNEXPECTED_NETWORK`; there is no silent fallback.

Payment recipient and amount come from the live challenge. Catalog data is not used as an authorization source, and the client does not hardcode `payTo`.

## External Data

Telegraph responses are treated as untrusted `unknown` data and normalized defensively. Missing optional fields remain visible as `null` or `[]`. Malformed response shapes, unexpected Intents, transport failures, challenge failures, payment failures, and response failures use classified errors. No external `200` status is interpreted as a Limen decision.

## Policy Configuration

`limen.yml` is parsed with a mature YAML library using core schema semantics and duplicate-key rejection. P2 permits only the bounded snake_case policy shape, rejects unknown keys and unsupported values, does not execute tags or expand environment values, and requires explicit risk appetite fields. Uncertainty settings safely default to `review`. Policy versions hash canonical effective content rather than source formatting.

## Future Controls

P1 ensures that repository policy, identity conflicts, severity conflicts, and missing evidence resolve deterministically to `PASS`, `HOLD`, or `REVIEW`. Later GitHub and ledger milestones must add least-privilege permissions, idempotency, durable redacted evidence, and explicit separation of test traffic from real user usage.
