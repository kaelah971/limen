---
name: Limen
document: Build Plan, Architecture and PRD
version: 1.0
status: GO
track: Telegraph Track 3 — Applications
source: Editable Markdown replacement derived from the supplied architecture/PRD PDF
---

# Limen — Build Plan, Architecture and PRD

> **Implementation source of truth for the Limen hackathon MVP.**

This editable Markdown replacement is derived from the supplied PDF brief. The original PDF remains unchanged. Product-facing identity, titles, architecture identifiers, policy filenames, receipt examples and implementation language have been migrated to **Limen**.

**Descriptor:** Release evidence gate

**Name meaning:** Latin *līmen* — threshold, boundary or point of entry.

**Track:** Telegraph Track 3 — Applications

**Status:** GO — paid Telegraph Engine x402 path validated

**MVP principle:** Evidence first, bounded decisions, real user usage, no synthetic metric inflation.

**UI rule:** Stop before web-app implementation and design the UI/design system separately.

---

## 1. Document Status
Field
Value
Product
Limen
Hackathon
Telegraph - Track 3 Applications
Implementation builder
OpenCode
Research / verification agent
Separate research agent; do not use it as the 
implementation builder
Technical status
GO - paid Engine x402 path validated
MVP principle
Evidence first, bounded decisions, real user usage, no 
synthetic metric inflation
UI rule
Stop before web-app implementation and design the 
UI/design system separately
## 2. Product Requirement Summary
Limen must run in or alongside a GitHub release workflow, collect repository-specific 
dependency exposure evidence, obtain a real paid Telegraph CVE_LOOKUP signal, evaluate a 
deterministic repository policy, and return PASS, HOLD, or REVIEW with an auditable evidence 
record.
Primary product requirement
A Telegraph signal must be able to influence a real release decision, but Telegraph must never be 
treated as the sole source of repository exploitability truth.
## 3. Goals
- Ship a real GitHub-centric release gate before the hackathon deadline.
- Use live Telegraph Engine routing and x402 payment for CVE_LOOKUP.
- Make PASS/HOLD/REVIEW deterministic and explainable.
- Preserve repository evidence and Telegraph provenance in one canonical decision object.
- Acquire real maintainers and measure genuine usage before submission.
- Provide a polished but intentionally small web control room and shareable evidence receipts.
- Create a submission evidence package that lets judges verify claims independently.
## 4. Non-Goals for the Hackathon MVP
- Replacing Dependabot, OSV, NVD, Snyk, or GitHub security tooling.
- Proving exploitability from CVE metadata.
- Autonomous merges or production deployments.
- Full SBOM platform.
- Autonomous remediation agent or automatic upgrade PR merging.
- Coding-agent interception.
- Enterprise billing, SSO, organization administration, or broad RBAC.
- Artificial Telegraph traffic generation.
- Multi-chain or mainnet payment complexity unless required by the live Engine.
## 5. System Architecture
```text
GitHub PR / release
      |
      +--> GitHub / Dependabot adapter
      |      -> RepositoryExposureEvidence
      |
      +--> Telegraph client
             -> Engine request
             -> HTTP 402 challenge
             -> x402 payment (Base Sepolia)
             -> retry with PAYMENT-SIGNATURE
             -> routed CVE_LOOKUP
             -> TelegraphCveEvidence
RepositoryExposureEvidence + TelegraphCveEvidence + LimenPolicy
      |
      v
Decision Engine
      |
      +--> PASS / HOLD / REVIEW
      +--> LimenDecisionResult
      +--> GitHub check/comment
      +--> Evidence ledger
      +--> Public/private evidence receipt
      +--> Web app / usage metrics
```
### 5.1 Architectural boundaries
Component
Responsibility
Must not do
GitHub adapter
Normalize repository exposure facts.
Call CVE Miner logic directly.
Telegraph client
Own Engine/x402/payment/routing 
normalization.
Make release-policy decisions.
Decision engine
Apply deterministic policy to 
normalized evidence.
Infer missing facts optimistically.
Evidence ledger
Persist decision + safe provenance + 
usage facts.
Store private keys or raw reusable 
payment credentials.
GitHub Action
Invoke the pipeline and surface 
outcomes in CI.
Contain duplicate business logic.
Web app
Display decisions, evidence, receipts, 
Become the source of truth for policy 



Component
Responsibility
Must not do
onboarding, usage.
decisions.
## 6. Canonical Domain Contracts
### 6.1 RepositoryExposureEvidence
```typescript
interface RepositoryExposureEvidence {
  repository?: string;
  commitSha?: string;
  pullRequestNumber?: number;
  packageName: string;
  ecosystem: string;
  installedVersion: string | null;
  vulnerableRange: string | null;
  firstPatchedVersion: string | null;
  cveId: string;
  severity: Severity | null;
  cvssScore: number | null;
  manifestPath: string | null;
  scope: "runtime" | "development" | "unknown";
  relationship: "direct" | "transitive" | "unknown";
  source: string;
}
```
### 6.2 TelegraphCveEvidence
```typescript
interface TelegraphCveEvidence {
  cveId: string | null;
  severity: Severity | null;
  cvssScore: number | null;
  description: string | null;
  references: string[];
  affectedVersions: string[] | null;
  fixedVersions: string[] | null;
  fixAvailable: boolean | null;
  intent: "CVE_LOOKUP";
  minerId: string | null;
  minerName: string | null;
  costUsd: number | null;
  durationMs: number | null;
  network: string | null;
  paymentScheme: string | null;
  requestedAt: string;
  receivedAt: string | null;
  raw: unknown;
}
```



Fixed-version fields are optional because the live validation showed they are not consistently 
supplied by CVE providers. Repository exposure facts remain the authority for vulnerable and 
patched version ranges.
### 6.3 Universal decision object
```typescript
type LimenDecision = "PASS" | "HOLD" | "REVIEW";
interface LimenDecisionResult {
  id: string;
  decision: LimenDecision;
  reasonCode: string;
  summary: string;
  cveId: string;
  repositoryEvidence: RepositoryExposureEvidence;
  telegraphEvidence: TelegraphCveEvidence | null;
  checks: DecisionCheck[];
  evaluatedAt: string;
  policyVersion: string;
}
```
Architecture rule
The GitHub Action, API, evidence ledger, web app, receipts, metrics, and judge mode must all consume 
the same canonical LimenDecisionResult. Do not create competing decision representations.
## 7. Policy Requirements
Each repository declares what conditions should block, pass, or require review. V1 should stay 
intentionally small.
```yaml
# limen.yml
production:
  block_severity:
    - critical
    - high
  dependency_scopes:
    - runtime
  missing_external_evidence: review
  severity_conflict: review
  cve_identity_conflict: review
  telegraph_failure: review
```

- Unknown or malformed severity normalizes to UNKNOWN.
- Telegraph unavailable or payment/routing failure -> REVIEW.
- CVE identity mismatch -> REVIEW.
- Material severity conflict -> REVIEW unless explicit policy says otherwise.
- Affected runtime dependency + blocking severity -> HOLD.
- Patched/non-affected repository state with no material conflict -> PASS.
- No universal confidence score should be invented.



## 8. Telegraph Integration Requirements
Requirement
Acceptance condition
Live challenge
Read payment details from the actual HTTP 402 response. 
Do not hardcode payTo or assume catalog price.
Network safety
Expected hackathon flow is Base Sepolia. Never silently fall 
back to mainnet.
x402
Use the validated official EVM client pattern and PAYMENT-
SIGNATURE retry flow.
Routing
Use Engine-routed CVE_LOOKUP, not direct provider URLs, 
for production decisions.
Provenance
Retain sanitized miner_id/miner_name when exposed, plus 
Intent, cost, duration, HTTP outcome, timestamps.
Secrets
Never persist private key, seed phrase, raw reusable 
payment proof, or auth credentials.
Failure semantics
Any payment, routing, response, or normalization failure is 
explicit and can produce REVIEW.
### 8.1 Proven reference execution
Item
Reference
Transaction
0x7458f82ad48c9bfd48d7dcd2bc17edd3b04b817c32ff00e
6037ace0029a5e03f
Intent
CVE_LOOKUP
Cost
$0.01
Duration
985 ms
CVE
CVE-2021-23337
Severity / CVSS
HIGH / 7.2
Policy output
HOLD
## 9. GitHub Integration Requirements
- Fetch or receive Dependabot/GitHub advisory data with least-privilege permissions.
- Normalize package name, ecosystem, vulnerable range, first patched version, severity, manifest path, 
scope, and direct/transitive relationship when available.
- Run on pull requests and/or explicit release/security workflows.
- Fail the CI check on HOLD.
- Surface REVIEW distinctly from HOLD; do not present an infrastructure failure as a confirmed 
vulnerability.
- Post a concise evidence summary or link to a receipt.
- Avoid embedding policy and Telegraph client logic directly inside the Action wrapper.
## 10. Evidence Ledger and Receipt Requirements
### 10.1 Evidence ledger
- Persist decision ID, repository, commit/PR, package, CVE, repository evidence, Telegraph evidence, 
policy version, decision, timestamps, cost, latency, and Miner provenance.
- Track whether a request is development/test or real user-generated usage.
- Support idempotency so retries do not create conflicting duplicate decisions.
- Preserve enough raw/sanitized evidence to audit a decision without storing secrets.
### 10.2 Shareable evidence receipt
Every decision should be renderable as a stable receipt, for example /r/LM-92K8F21, containing the 
release context, decision, policy version, repository evidence, Telegraph 
Intent/provider/cost/latency, checks, and timestamp.
## 11. Web App Scope
STOP GATE
Do not implement the web app UI until the product team has separately locked the UI, information 
architecture, and design system. OpenCode should stop and request the approved UI handoff at this 
milestone.
The eventual hackathon web app should remain small and function as a release control room, not a 
sprawling security SaaS dashboard.
- Landing / product explanation.
- Dashboard of recent release decisions and simple usage metrics.
- Release decision detail.
- Evidence receipt route.
- Setup/onboarding page for the GitHub Action.
- Judge/demo mode using real Telegraph calls, not mocked live results.
## 12. Reliability Requirements
Risk
Required behavior
Telegraph timeout
Bounded retry, then REVIEW.
402/payment failure
Typed error + REVIEW; never PASS.
Malformed Miner output
Normalize defensively; missing critical evidence can trigger 



Risk
Required behavior
REVIEW.
Duplicate CVEs in one workflow
Suppress duplicate paid calls where safe.
GitHub API rate limit
Explicit error / retry guidance, no silent degraded decision.
CVE identity mismatch
REVIEW.
Severity conflict
REVIEW according to policy.
Repeated workflow execution
Idempotent decision/evidence persistence.
## 13. Security Requirements
- Strict secret redaction for private keys, payment signatures, auth credentials, and reusable proofs.
- Least-privilege GitHub token permissions.
- Schema validation at every external boundary.
- No arbitrary command execution from limen.yml.
- No mainnet fallback when a testnet network is expected.
- Safe logging that preserves provenance while removing secrets.
- A short threat model in docs/security-model.md before submission.
- Validation evidence directory remains immutable and separate from production secrets.
## 14. Observability and Hackathon Metrics
Metric
Implementation note
Repositories installed
Distinct real repositories.
Unique maintainers
Distinct real users/operators where measurable.
Real release checks
Separate from local/dev tests.
Unique CVEs evaluated
Avoid counting duplicates as adoption.
PASS / HOLD / REVIEW
Decision distribution.
Paid Telegraph requests
Actual Engine calls only.
USDC spent
Sum real x402 cost.
Average / p95 latency
CI viability.
Miner distribution
Retain miner_id/miner_name when exposed.
Failure / REVIEW rate
Reliability signal.



Never generate artificial request volume for leaderboard optics. The submission should distinguish 
test traffic from organic user-generated traffic.
## 15. Build Milestones
Phase
Scope
Exit condition
P0 - Foundation
Repo structure, domain contracts, 
Telegraph client, x402 reuse, 
normalization, typed errors, redaction, 
tests, docs.
Strict typecheck/tests pass; no GitHub 
Action or UI built.
P1 - Decision engine
Canonical PASS/HOLD/REVIEW 
evaluator and reason codes.
Seven validated scenarios pass as 
automated tests.
P2 - Policy system
limen.yml parsing/validation and 
bounded V1 rules.
Policy versions are deterministic and 
tested.
P4 - GitHub evidence adapter
Normalize 
Dependabot/advisory/repository 
exposure facts.
Real repository fixture produces 
RepositoryExposureEvidence.
P3 - GitHub Action
Run pipeline on PR/release and surface 
decision.
Real vulnerable PR can HOLD; patched 
PR can PASS.
P5 - Evidence ledger
Durable decision/provenance 
persistence and usage separation.
Decision can be retrieved by ID and 
audited.
Early beta
Onboard initial maintainers before UI 
polish.
At least first genuine external repo 
usage captured.
P6 - Evidence receipts
Stable shareable decision receipt 
object/route.
Receipt explains decision without 
exposing secrets.
P7 - UI design gate
Product team locks UI/design system 
before implementation.
Approved design handoff exists.
P7 - Web app implementation
Landing, dashboard, decision detail, 
receipt, setup.
Polished core surfaces work on real 
data.
P8 - Onboarding
Low-friction Action setup.
New maintainer can enable Limen 
quickly.
P9 - Demo repository
Controlled real GitHub examples.
Inspectible PASS/HOLD/REVIEW flows.
P11 - Telegraph observability
Usage, cost, latency, Miner 
provenance.
Dashboard/submission metrics are 
evidence-backed.
P12 - Reliability
Retries, idempotency, rate limits, 
malformed responses.
Failure modes become REVIEW or 
typed errors predictably.
P13 - Security hardening
Secrets, permissions, validation, threat 
Security checklist and tests pass.



Phase
Scope
Exit condition
model.
More real users
Expand maintainers and repeat usage.
Submission has genuine activity 
evidence.
P14 - Judge Mode
Real paid Telegraph demonstrations.
No mocked Miner result presented as 
live product evidence.
P15 - Submission package
Architecture, proof, adoption, 
limitations, screenshots/video.
Judges can verify key claims.
P16 - Build in public
Runs in parallel throughout.
Public posts show protocol + product 
+ user evidence.
## 16. Immediate Chronological Build Order
```text
P0 Foundation
 -> P1 Decision engine
 -> P2 Policy model
 -> P4 GitHub evidence adapter
 -> P3 GitHub Action
 -> P5 Evidence ledger
 -> FIRST REAL USERS
 -> P6 Receipts
 -> P7 UI DESIGN WITH PRODUCT TEAM
 -> P7 Web app implementation
 -> P8 Onboarding
 -> P9 Demo repository
 -> P11 Usage/Telegraph metrics
 -> P12 Reliability
 -> P13 Security hardening
 -> MORE REAL USERS
 -> P14 Judge Mode
 -> P15 Submission package
```
P16 Build-in-public runs throughout.
## 17. Phase Acceptance Detail
### P0 acceptance
- Stable repository structure and strict TypeScript.
- RepositoryExposureEvidence, TelegraphCveEvidence, and LimenDecisionResult types exist.
- Telegraph client hides x402 complexity from the rest of the product.
- Live 402 values are not improperly hardcoded.
- Secrets are not logged or persisted.
- Miner provenance remains available when exposed.
- Normalization, redaction, configuration, and error tests pass.
- No GitHub Action or UI is prematurely implemented.
### P1 acceptance
- Clear vulnerable release -> HOLD.
- Patched release -> PASS.
- Missing Telegraph fields -> REVIEW.
- Telegraph failure -> REVIEW.
- Severity disagreement -> REVIEW.
- CVE identity disagreement -> REVIEW.
- No repository vulnerability -> PASS.
- Every outcome has deterministic reason codes and checks.
### P3/P4 acceptance
- A real GitHub repository can provide normalized exposure evidence.
- A PR workflow performs the paid Telegraph request and decision evaluation.
- HOLD fails the check.
- PASS succeeds.
- REVIEW is clearly distinguishable from HOLD.
- The GitHub output includes evidence provenance without leaking credentials.
## 18. Judge Mode and Demo Requirements
Judge Mode must show real product behavior using real Telegraph Miners. Static fixtures remain 
acceptable for internal unit tests, but they must not be presented as live Track 3 usage.

1. Open a dependency-sensitive pull request or controlled demo repository case.
2. Show repository exposure facts.
3. Show the live Telegraph Engine request and x402 payment path.
4. Show Intent, routed Miner provenance when exposed, cost and latency.
5. Show normalized CVE evidence.
6. Show Limen checks and PASS/HOLD/REVIEW.
7. Show the GitHub check and evidence receipt.
8. Show aggregate real usage: repositories, release checks, paid requests, USDC spent.
## 19. Demo Repository Requirements
Case
Purpose
Expected outcome
Known vulnerable dependency
Show a real release block.
HOLD
Patched/non-affected dependency
Show the gate does not blindly block.
PASS
Real failure/uncertainty path where 
safely reproducible
Show uncertainty semantics.
REVIEW
Do not use a mocked Telegraph response and describe it as live. If REVIEW requires a controlled test 
fixture for internal tests, label it clearly as a fixture.



## 20. Submission Evidence Package
docs/evidence/
  architecture.md
  paid-telegraph-proof.md
  test-cases.md
  adoption.md
  limitations.md
  security-model.md
  usage-metrics.md
  screenshots/
External proof:
  public app
  public GitHub repository
  demo repository
  Base Sepolia settlement transaction
  real GitHub checks
  real user/repository activity
  short demo video
## 21. Build-in-Public Workstream
Public proof should run in parallel with implementation. Posts should emphasize protocol evidence, 
product evidence, and real-user evidence rather than generic progress updates.
- Protocol: live CVE_LOOKUP route, cost, latency, sanitized x402/settlement proof.
- Product: a real release was held, passed, or sent to review with an evidence receipt.
- Users: repositories installed, repeat release checks, maintainer feedback.
- Learning: failure cases, provider completeness differences, why REVIEW exists.
## 22. Risks and Mitigations
Risk
Severity
Mitigation
GitHub already provides most 
exposure facts
Serious
Position Telegraph as routed second-
source evidence/provenance and 
make it materially affect 
REVIEW/conflict handling.
CVE providers omit fixed versions
Known / manageable
Keep version exposure authoritative on 
GitHub/Dependabot side; fields 
optional in Telegraph schema.
Telegraph payment/routing outage
Serious
Bounded retries then REVIEW; never 
silent PASS.
False-positive release block
Serious
Deterministic repo policy, explicit 
evidence checks, HOLD only when 
repository facts justify it.
Hackathon time spent on UI
Serious
Build Action + decision loop + real 



Risk
Severity
Mitigation
users before web-app polish; UI stop 
gate.
Artificial usage temptation
Disqualifying risk
Separate dev/test from organic usage 
and never inflate requests.
Secret leakage
Blocker
Redaction tests, least privilege, never 
persist private key/raw payment proof.
Looks like "Dependabot + API call"
Strategic
Emphasize release permission 
boundary, independent route 
provenance, uncertainty handling, 
receipts, real x402 demand.
## 23. Post-Hackathon Roadmap - Explicitly Deferred
Version
Deferred capability
V1.5
GitHub App, organization onboarding, multi-repo controls.
V2
SBOM ingestion and full dependency-risk inventory.
V2.5
Human-approved remediation and draft upgrade PR 
generation.
V3
Coding-agent dependency interception and broader 
software supply-chain permission layer.
Commercial
Billing, private repository plans, enterprise policy 
management, long-term audit retention.
## 24. Definition of Hackathon Done
- A real repository can install/use Limen.
- A real dependency-sensitive workflow can produce PASS/HOLD/REVIEW.
- At least one live path performs a genuine paid Telegraph Engine CVE_LOOKUP request.
- The result is surfaced in GitHub and persisted as an evidence decision.
- Real users/repositories have generated genuine activity.
- Usage metrics distinguish real user traffic from development tests.
- The web app exposes the core product story without overbuilding.
- Judge Mode uses real Miner data.
- Security limitations and product claims are documented honestly.
- The submission package contains independently verifiable proof.



## 25. Current Next Action
Start P0 with OpenCode
Implementation begins with the foundation only: reuse the validated x402/CVE path, establish domain 
contracts and normalization, add typed errors/redaction/tests, and stop before P1. Do not let OpenCode 
jump ahead into the GitHub Action or UI.
- OpenCode builds; the separate research agent is used only when a specific verification question 
appears.
- Every milestone ends with tests, a completion report, and an explicit stop before the next phase.
- Start real maintainer onboarding as soon as the Action + decision engine are usable; do not wait for 
the web app.
- Return to the product team before P7 so the UI, information architecture, and design system are 
locked before frontend implementation.
