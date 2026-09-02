---
name: Limen
document: Product Idea
version: 1.0
status: GO
track: Telegraph Track 3 — Applications
source: Editable Markdown replacement derived from the supplied product brief
---

# Limen — Product Idea

> **A release-evidence gate for dependency-sensitive software releases.**

**Built for Telegraph Protocol Track 3: Applications.**

**Descriptor:** Release evidence gate

**Core decision:** `PASS` / `HOLD` / `REVIEW`

**Primary Telegraph Intent:** `CVE_LOOKUP`

## Name decision

**Limen** comes from the Latin *līmen*: a threshold, boundary or point of entry. It names the exact boundary where evidence becomes a release decision—the point at which a change is allowed to leave the repository.

**Pronunciation:** `LYE-men`

The name is deliberately broader than “security scanner” or “ship fence”. Limen can begin as a dependency-sensitive release gate and grow into a permission layer for software supply-chain changes without making the master brand sound like one implementation detail.

The name recommendation is strategic, not legal clearance. Trademark, domain, social-handle and collision checks must be completed separately before public launch.

## 1. Executive summary

Limen is a developer security product that sits inside the software release workflow and asks a narrower, more useful question than a vulnerability dashboard:

> **Does this exact release have enough trustworthy evidence to proceed?**

It combines repository-specific dependency exposure facts from GitHub/Dependabot with a paid, routed Telegraph `CVE_LOOKUP` request. Limen then applies deterministic project policy and returns one of three outcomes:

- `PASS`
- `HOLD`
- `REVIEW`

### The core thesis

Security tooling should not silently turn one upstream advisory feed into the sole authority for a production release. Limen adds an independent routed evidence layer, preserves provenance, and makes uncertainty explicit instead of pretending certainty.

## 2. The problem

Modern repositories already receive dependency alerts, but alerts are not release decisions. Maintainers still have to interpret:

- whether a vulnerable package affects the repository;
- whether a patch exists;
- how severe the issue is;
- whether the dependency is runtime or development-only; and
- whether the release should be blocked.

The recurring problems are:

- Dependency alerts can be noisy and easy to defer.
- A repository-specific exposure fact and an external CVE fact are different things, but they are often collapsed into one alert.
- A failed or incomplete external lookup is frequently treated as operational noise instead of a first-class uncertainty state.
- Small teams rarely have a dedicated security engineer sitting inside every pull request.
- CI usually answers whether tests passed, not whether security-sensitive evidence is sufficient to ship.

## 3. Target users

| User | Pain | Why Limen matters |
|---|---|---|
| Open-source maintainers | Security alerts compete with feature work and release pressure. | A simple release gate turns advisory noise into a bounded decision. |
| Small SaaS engineering teams | No dedicated AppSec person on every release. | Repository policy is enforced automatically while uncertainty escalates to humans. |
| DevOps / platform engineers | Need auditable CI behavior across repositories. | Decision receipts and evidence provenance make release holds explainable. |
| Security-minded developer teams | Want independent evidence without replacing existing tooling. | Telegraph becomes a second-source routing and provenance layer, not a replacement for Dependabot. |

## 4. What Limen actually does

```text
PR / dependency change
        |
GitHub / Dependabot repository evidence
        +
Telegraph Engine -> paid CVE_LOOKUP -> routed Miner evidence
        |
Limen deterministic policy
        |
PASS  |  HOLD  |  REVIEW
        |
GitHub check + evidence record + shareable receipt
```

The product deliberately separates evidence sources so each one is trusted only for what it actually knows.

| Layer | Owns | Does not own |
|---|---|---|
| GitHub / Dependabot | Package identity, vulnerable version range, first patched version, manifest, runtime/dev scope, direct/transitive relationship. | Independent routed provider provenance. |
| Telegraph | Timestamped CVE facts, routed provider provenance, Intent, cost, latency, payment/routing metadata, incomplete/failure signals. | Whether this repository is actually exploitable. |
| Limen | Project policy and `PASS` / `HOLD` / `REVIEW` decision. | A universal definition of acceptable risk for every team. |

## 5. Decision model

### `PASS`

The repository facts indicate the dependency is not affected or is already patched, required evidence is present, and there is no material identity or severity conflict that the active policy says requires review.

### `HOLD`

The repository facts show an affected dependency and the project policy explicitly blocks that condition. A `HOLD` is an intentional release stop, not a generic security warning.

### `REVIEW`

Evidence is missing, conflicting, malformed or unavailable. `REVIEW` is critical to Limen: failure to obtain external evidence must never silently become `PASS`.

| Scenario | Expected state |
|---|---|
| Clear vulnerable runtime release | `HOLD` |
| Patched release | `PASS` |
| Missing Telegraph fields | `REVIEW` |
| Telegraph timeout or payment/routing failure | `REVIEW` |
| Severity disagreement | `REVIEW` |
| CVE identity disagreement | `REVIEW` |
| No repository vulnerability | `PASS` |

## 6. Why Telegraph is necessary

Limen is not trying to replace the GitHub Advisory Database, OSV, NVD, Snyk or Dependabot. The Telegraph layer is valuable for a different reason: it creates a paid, routed, timestamped second-source evidence path whose provider provenance and operational metadata can be retained with the release decision.

- The Engine routes a natural-language request to a `CVE_LOOKUP` Miner rather than Limen permanently hardcoding one provider.
- The x402 payment path creates genuine demand for the Telegraph intelligence market.
- Routing metadata, cost, latency and provider provenance become part of the release evidence trail.
- Provider incompleteness or failure becomes useful information that can trigger `REVIEW`.
- Telegraph is an evidence and provenance layer, not a repository exploitability oracle.

## 7. Proven live validation

### GO — paid Engine path proven

A genuine live Engine request returned HTTP `402`. An official x402 EVM client constructed the payment proof. The payment settled on Base Sepolia. The Engine retry returned HTTP `200` and routed `CVE_LOOKUP` evidence into the existing Limen policy, which returned `HOLD`.

| Proof item | Verified result |
|---|---|
| Network | Base Sepolia |
| x402 version / scheme | v2 / exact |
| Paid amount | 10000 USDC base units, approximately $0.01 |
| Settlement transaction | `0x7458f82ad48c9bfd48d7dcd2bc17edd3b04b817c32ff00e6037ace0029a5e03f` |
| Engine response | HTTP `200` after payment |
| Intent | `CVE_LOOKUP` |
| Engine duration | 985 ms |
| Routed result | `CVE-2021-23337` — Lodash — HIGH — CVSS 7.2 — affected prior to 4.17.21 |
| Limen policy result | `HOLD` |

## 8. Core user experience

1. A maintainer installs Limen in a repository and commits a small policy file.
2. A pull request or dependency-sensitive release runs the Limen workflow.
3. Limen reads repository-specific exposure facts and identifies the relevant CVE.
4. Limen performs a real paid Telegraph `CVE_LOOKUP` request.
5. Telegraph evidence is normalized and compared with repository evidence.
6. The deterministic policy returns `PASS`, `HOLD` or `REVIEW`.
7. GitHub receives a check result and an evidence summary.
8. The decision is stored as a durable record and can be viewed as a shareable receipt.

## 9. Product surfaces

| Surface | Purpose |
|---|---|
| GitHub Action / CI integration | The actual release gate. Runs where developers already work. |
| Policy file | Lets the repository define what risk it will block or review. |
| Evidence ledger | Stores decisions, repository evidence, Telegraph provenance, cost, latency and timestamps. |
| Evidence receipt | Explains exactly why a release was passed, held or sent to review. |
| Web app / control room | Shows repositories, recent release decisions, evidence, usage and onboarding. |
| Demo repository | Makes `PASS` / `HOLD` / `REVIEW` behavior inspectable by judges and prospective users. |

## 10. Differentiation

Limen should not compete by claiming a larger vulnerability database. Existing security products already dominate alert generation and remediation. Its wedge is the release decision boundary.

### Positioning line

> **Dependabot tells you there is a vulnerability. Limen decides whether this release can proceed under your policy, with repository facts plus independently routed CVE evidence.**

| Alternative | What it does well | Limen wedge |
|---|---|---|
| Dependabot / GitHub security alerts | Repository-aware vulnerability alerting and patch information. | Turns exposure facts plus external evidence into an explicit release permission decision. |
| Snyk / scanners | Broad vulnerability intelligence and developer security tooling. | Small, transparent CI gate with evidence provenance rather than another dashboard. |
| Direct NVD / OSV API integration | Cheap deterministic access to known vulnerability data. | Routed provider provenance, paid demand and explicit uncertainty handling. |
| Generic AI security agent | Can summarize or reason over alerts. | Deterministic policy owns the final boundary; AI/probabilistic evidence cannot silently authorize a release. |

## 11. Recurring usage and Telegraph demand

Limen naturally creates legitimate recurring requests whenever repositories receive dependency alerts, open dependency-sensitive pull requests or run scheduled security checks. The hackathon strategy is to prioritize real maintainer usage rather than synthetic request volume.

- One paid Telegraph request per relevant CVE decision, with duplicate suppression inside a workflow.
- Real repository and maintainer counts tracked separately from development/test calls.
- USDC spend, request latency, Intent and Miner provenance recorded as protocol evidence.
- No artificial loops to inflate request counts.

## 12. Trust and safety principles

- A Telegraph failure becomes `REVIEW`, never silent `PASS`.
- Repository exploitability is not inferred from CVE metadata alone.
- CVE identity conflicts escalate instead of being merged away.
- Severity conflicts escalate according to deterministic policy.
- Private keys, seed phrases, raw payment proofs and reusable credentials are never persisted.
- Useful provenance such as `miner_id`, `miner_name`, Intent, cost and duration should be retained when exposed.
- The product uses least-privilege GitHub permissions and auditable policy versions.

## 13. What Limen must not claim

- “Telegraph proves this repository is safe.”
- “Telegraph determines whether the vulnerability is exploitable in this project.”
- “A Miner returning HTTP 200 means the release is approved.”
- “Missing evidence means no vulnerability exists.”
- “Multiple decentralized validators certified this result” unless that exact claim is independently true for the environment being shown.

## 14. Hackathon fit

Limen is a Track 3 application because it turns live Miner intelligence into a real workflow action. It demonstrates the demand side of Telegraph: real developers create real `CVE_LOOKUP` requests, x402 payments settle, routed Miner evidence is consumed, and the result changes a release decision.

| Track 3 signal | How Limen demonstrates it |
|---|---|
| Users and activity | Maintainers install the Action and run real release checks. |
| Usage / adoption | Repository installs, real CVEs evaluated, repeat checks and returning users. |
| Creativity / usefulness | A release-evidence gate rather than a generic CVE answer screen. |
| Mandatory Miner use | Real Engine-routed `CVE_LOOKUP` requests through x402. |
| Public engagement | Build-in-public evidence posts, decision receipts, demo repository and user outcomes. |

### Visible Telegraph rules to respect

The published hackathon rules make these non-negotiable for the application:

- Use real Telegraph Miners; simulated or mocked data is not allowed for Track 3 usage.
- Keep Miners and Script Authors live and operational throughout Track 3 where applicable.
- Post judging updates publicly on X and tag `@Telegraphprotoc`.
- Do not artificially inflate metrics or game the system.
- Join and stay active in the official hackathon Discord.

## 15. Success metrics

| Metric | Why it matters |
|---|---|
| Repositories installed | Actual adoption. |
| Unique maintainers | Real users, not self-generated requests. |
| Real release checks | Product activity. |
| Unique CVEs evaluated | Breadth of use. |
| `PASS` / `HOLD` / `REVIEW` counts | Proof the policy creates meaningful outcomes. |
| Paid Telegraph requests and USDC spent | Direct evidence of routed network demand. |
| Miner distribution | Evidence that routing is not permanently pinned to one provider. |
| Average latency / failure rate | CI viability and reliability. |
| “Would you keep this enabled?” responses | Best early retention signal. |

## 16. Business model

The hackathon MVP should be free and frictionless for public repositories. A credible post-hackathon model is:

- free public-repository usage;
- paid private repositories;
- organization policy management;
- longer evidence retention;
- audit exports; and
- security-team controls.

## 17. Long-term direction

| Stage | Expansion |
|---|---|
| V1 | GitHub Action, repository policies, paid Telegraph evidence, receipts and control room. |
| V1.5 | GitHub App installation and multi-repository organization view. |
| V2 | SBOM ingestion and broader dependency-risk policy. |
| V2.5 | Human-approved remediation proposals and draft upgrade PRs. |
| V3 | Permission layer for coding agents and automated dependency changes: `ALLOW` / `HOLD` / `REVIEW` before supply-chain mutations. |

### Long-term thesis

Limen can grow from a release gate into a permission layer for software supply-chain changes, while keeping deterministic policy—not model confidence—as the final authority.

## 18. One-sentence pitch

> **Your CI already asks whether the tests passed. Limen asks whether this release has enough trusted evidence to leave the repository.**

## Final product recommendation

Build Limen as a narrow, evidence-first release boundary. Do not become another vulnerability dashboard. The strongest demo is one real dependency-sensitive pull request that shows repository evidence, a paid routed Telegraph request, a visible provenance record, a deterministic `HOLD`, a patched `PASS` and a failure-driven `REVIEW`—all through the same canonical decision object.
