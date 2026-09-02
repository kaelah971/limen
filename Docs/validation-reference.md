# Paid Telegraph Validation Reference

This file records the supplied historical proof for the Telegraph Engine path. It is not a new live smoke test and contains no credentials or reusable payment material.

Product now called: **Limen**

Historical validation project: `/home/ubuntu/shipfence-validation/`

The validation happened before the product rename from ShipFence to Limen. The historical directory name is intentional and must remain unchanged.

## Proven Reference Execution

| Field | Verified result |
|---|---|
| CVE | `CVE-2021-23337` |
| Intent | `CVE_LOOKUP` |
| Network | Base Sepolia |
| x402 version | `v2` |
| Scheme | `exact` |
| Cost | `$0.01` |
| Engine duration | `985 ms` |
| Severity | `HIGH` |
| CVSS | `7.2` |
| Policy output | `HOLD` |
| Settlement transaction | `0x7458f82ad48c9bfd48d7dcd2bc17edd3b04b817c32ff00e6037ace0029a5e03f` |

The run returned HTTP `402`, used the official x402 EVM client to construct payment proof, settled on Base Sepolia, retried with `PAYMENT-SIGNATURE`, and received HTTP `200` from the Engine. The routed result concerned Lodash versions before `4.17.21`.

## Immutability

The historical validation directory is evidence, not production source. Do not rename, rewrite, or copy secret-bearing files from it. Production code may adapt the validated x402 flow and safe response-normalization patterns, but must keep private keys, raw payment proof, signatures, and reusable credentials out of source control and telemetry.

The canonical Linux validation path was not mounted in this Windows workspace during P0, so no historical files were modified or represented as newly inspected implementation artifacts. The reference values above come from the approved Limen project inputs.
