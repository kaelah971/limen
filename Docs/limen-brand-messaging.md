---
name: Limen
document: Brand Messaging Architecture
version: 1.0
status: Approved working direction
descriptor: Release evidence gate
primary_tagline: "Let evidence set the threshold."
primary_telegraph_intent: CVE_LOOKUP
source_strategy: limen-seven-scope-and-brand-strategy.md
---

# Limen — Brand Messaging Architecture

> **Let evidence set the threshold.**

**Descriptor:** Release evidence gate

**Product category:** Dependency-sensitive release decision and evidence system

**Primary Telegraph Intent:** `CVE_LOOKUP`

## 1. Executive messaging decision

Limen must not present itself as another vulnerability dashboard, a replacement for Dependabot, a generic AI security agent or a blockchain-powered AppSec product.

Its strongest position is narrower and more useful:

> **Limen is the release permission boundary where repository facts, independently routed Telegraph evidence and declared policy become a clear `PASS`, `HOLD` or `REVIEW` decision.**

That distinction should govern every public surface:

- the homepage;
- the GitHub Action;
- the pull-request summary;
- the decision detail page;
- the evidence receipt;
- the hackathon demo;
- the README;
- the pitch deck; and
- build-in-public communication.

The product does not claim certainty. It makes the threshold for proceeding explicit.

## 2. Messaging foundation

### Purpose

**Make software changes earn the right to ship.**

### Vision

**A software supply chain where every consequential change crosses an evidence-aware permission boundary.**

### Mission

**Give maintainers a deterministic release decision backed by repository facts, independent routed evidence and a clear audit trail.**

### Category

**Release evidence gate**

Use this phrase consistently. It is more understandable and ownable than “decentralized security,” “AI vulnerability intelligence” or “blockchain-powered AppSec.”

### Priority audience

Small engineering teams, open-source maintainers and DevOps/platform engineers who own releases without a dedicated AppSec specialist beside every pull request.

### Primary user

A maintainer or engineer merging a dependency-sensitive change.

### Economic buyer

An engineering lead, platform lead or security-conscious founder.

### Influencer

A security engineer, DevOps engineer or compliance-minded customer.

### Gatekeeper

Repository permissions and CI policy.

### Core problem

A dependency alert says that something may be wrong. It does not say whether this exact repository and release should proceed, and it does not explain what to do when independent evidence is incomplete or conflicting.

### Primary promise

> **Limen turns security-sensitive release uncertainty into an explicit, policy-backed decision.**

### Difference

Limen combines two different evidence types without pretending they are the same:

1. **Repository facts** — what package, version, scope, manifest and release context are actually present in this project.
2. **Independently routed evidence** — what Telegraph returns through a real paid `CVE_LOOKUP` request, including operational provenance where exposed.

A deterministic policy then decides whether the release receives `PASS`, `HOLD` or `REVIEW`.

### Reason to believe

The supplied project brief records a live end-to-end path:

1. The engine request returns HTTP `402`.
2. The official x402 EVM client constructs payment proof.
3. Payment settles on Base Sepolia.
4. The retry returns HTTP `200`.
5. Telegraph routes a `CVE_LOOKUP` result.
6. Limen normalizes the evidence.
7. Deterministic policy returns `HOLD`.

The supplied reference also records a Base Sepolia settlement, `CVE_LOOKUP`, approximately $0.01 in USDC base units, 985 ms duration and a Lodash `HIGH` severity result. Treat these as supplied validation evidence. Any public claim should make the proof independently inspectable before publication.

### Emotional value

The maintainer feels that the release boundary is calm, explainable and under control—not dependent on a vague green light or a dashboard they must interpret under pressure.

### Social value

The engineering team can show that its release decision was evidence-led, policy-backed and honest about uncertainty.

### Strategic tension

> **Independent evidence without decision paralysis.**

Telegraph adds independent routing, provenance and an economically real evidence path. Deterministic project policy keeps the result actionable.

### Strategic enemy

Limen stands against:

- silent confidence from a single upstream feed;
- alert fatigue that turns serious findings into backlog noise;
- automation that cannot explain why it blocked or passed;
- treating provider failure as proof of safety; and
- allowing model confidence to authorize an irreversible software change.

## 3. Positioning

### Internal positioning statement

> For maintainers and small engineering teams who need to decide whether a dependency-sensitive release can proceed, Limen is a release-evidence gate that combines repository-specific exposure facts with independently routed Telegraph CVE evidence and returns a policy-backed `PASS`, `HOLD` or `REVIEW`. Unlike a vulnerability dashboard or direct provider lookup, Limen preserves provenance and treats missing or conflicting evidence as an explicit review state rather than silently authorizing release.

### Short positioning statement

> Limen is the release-evidence gate that turns repository facts and routed CVE evidence into a policy-backed release decision.

### Category explanation

> A vulnerability scanner tells you that an advisory may matter. A release-evidence gate tells you whether this exact change has enough evidence to proceed under your repository’s policy.

### What Limen is

- a release-evidence gate;
- a policy-backed decision layer for dependency-sensitive changes;
- a bridge between repository context and routed external evidence;
- an explicit `PASS`, `HOLD` or `REVIEW` workflow; and
- a shareable evidence and provenance record.

### What Limen is not

- a replacement for Dependabot, OSV, NVD, Snyk or GitHub security tooling;
- a universal exploitability oracle;
- a generic AI security agent;
- an autonomous merger or deployment system; or
- a dashboard that converts every uncertainty into a warning nobody acts on.

## 4. The messaging house

```text
                         ┌──────────────────────────────────────────┐
                         │              CORE MESSAGE                │
                         │ Limen is the threshold between a tested  │
                         │ release and a trusted release.           │
                         └──────────────────────────────────────────┘
                                          │
             ┌────────────────────────────┼────────────────────────────┐
             ▼                            ▼                            ▼
      ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
      │ PILLAR 1     │             │ PILLAR 2     │             │ PILLAR 3     │
      │ Separate     │             │ Route        │             │ Make         │
      │ the evidence │             │ independent  │             │ uncertainty  │
      │              │             │ intelligence │             │ actionable   │
      └──────────────┘             └──────────────┘             └──────────────┘
             │                            │                            │
             ▼                            ▼                            ▼
      Repository facts             Real paid route               PASS / HOLD / REVIEW
      stay distinct from           and provenance                are explicit states
      external findings            are visible                    with next actions
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │ PILLAR 4             │
                               │ Leave a receipt      │
                               │ Every decision       │
                               │ remains explainable  │
                               └──────────────────────┘
                                          │
                         ┌──────────────────────────────────────────┐
                         │              FOUNDATION                  │
                         │ Make software changes earn the right     │
                         │ to ship.                                 │
                         └──────────────────────────────────────────┘
```

### Roof: core message

> **Limen is the threshold between a tested release and a trusted release.**

“Trusted” here means supported by the available evidence and the active policy. It does not mean guaranteed safe.

### Pillar 1 — Separate the evidence

**Message**

Repository facts and external CVE facts answer different questions. Limen keeps them separate so neither source claims knowledge it does not have.

**Why it matters**

A provider may return a severity or fixed version without understanding the exact package relationship, runtime scope or manifest context in the repository. The release decision needs both forms of evidence in their proper roles.

**Proof points**

- Package identity remains tied to the repository.
- Affected ranges and patched versions are shown as source-specific facts.
- Manifest paths and runtime scope remain visible.
- Telegraph contributes routed CVE facts and operational provenance.
- Missing fields do not silently overwrite authoritative repository facts.

**Message examples**

- “Your repository tells us what is installed. Telegraph tells us what its routed evidence found.”
- “Two sources. One explicit decision. No hidden merge of facts.”
- “Limen keeps project context and external evidence in view together—and distinct.”

### Pillar 2 — Route independent intelligence

**Message**

Telegraph gives the release workflow a paid, routed second-source evidence path instead of a permanently hardcoded provider.

**Why it matters**

The product turns protocol infrastructure into a visible workflow consequence. The maintainer can see that a real request was made, paid for and returned through a routed path.

**Proof points**

- Real Engine routing.
- x402 settlement.
- `CVE_LOOKUP` Intent.
- Miner/provider provenance where exposed.
- Cost, duration and timestamps.
- A normalized result consumed by the same decision object as the GitHub Action and receipt.

**Message examples**

- “A release check can request routed evidence when it needs another signal.”
- “The route, payment and response are part of the proof—not hidden plumbing.”
- “Limen makes Telegraph demand visible at the moment a release decision matters.”

### Pillar 3 — Make uncertainty actionable

**Message**

Limen does not convert missing evidence into a green light.

**Why it matters**

Provider failure, incomplete fields, malformed responses and material disagreement are not proof of safety. They require an explicit human review state.

**Proof points**

- `PASS` means evidence supports proceeding under policy.
- `HOLD` means policy intentionally blocks the release.
- `REVIEW` means evidence is missing, conflicting, malformed or unavailable.
- Every outcome includes a reason code and next action.
- Telegraph failure becomes `REVIEW`, never silent `PASS`.

**Message examples**

- “Review is a result, not a failure.”
- “When the evidence disagrees, Limen shows the disagreement.”
- “No evidence is not the same as safe.”

### Pillar 4 — Leave a receipt

**Message**

Every release decision should be explainable after the check has finished.

**Why it matters**

A CI log disappears into history. A receipt keeps the release context, evidence, policy and decision together so a teammate, reviewer or judge can understand what happened later.

**Proof points**

- Canonical decision object.
- Policy version.
- Evidence records and checks.
- Request and decision timestamps.
- Cost, latency and provider provenance where exposed.
- Stable, shareable receipt route.
- Safe redaction of sensitive material.

**Message examples**

- “The decision travels with the proof.”
- “Open the receipt to see what was evaluated, what was found and why the policy decided.”
- “A green check is not an explanation. The receipt is.”

## 5. Message layers

Limen’s messages must clear these layers in order.

### Layer 1 — Clarity: what is it?

> **A release-evidence gate for dependency-sensitive software changes.**

Do not lead with “decentralized security,” “AI vulnerability intelligence” or “blockchain-powered AppSec.” Those phrases create abstraction before comprehension.

### Layer 2 — Relevance: is it for me?

> **For maintainers and small engineering teams who need to decide whether a dependency-sensitive release can proceed.**

### Layer 3 — Value: what do I get?

> **A clear `PASS`, `HOLD` or `REVIEW` decision backed by repository facts, routed CVE evidence and the policy your repository already follows.**

### Layer 4 — Differentiation: why Limen?

> **Unlike a vulnerability dashboard or direct provider lookup, Limen keeps repository context and external evidence distinct, treats uncertainty as an explicit review state and leaves an auditable receipt.**

### The five-second test

A stranger reading the first screen should understand:

1. Limen is for software releases.
2. It evaluates dependency-sensitive changes.
3. It combines repository facts with routed evidence.
4. It returns `PASS`, `HOLD` or `REVIEW`.
5. The next action is to run a release check or inspect the proof.

## 6. Core message hierarchy

### One-line description

> **Limen is a release-evidence gate that turns repository exposure and routed CVE evidence into a policy-backed `PASS`, `HOLD` or `REVIEW`.**

### Brand statement

> Software changes should earn the right to ship. Limen combines what your repository knows with independently routed Telegraph CVE evidence, then applies your release policy to produce a clear `PASS`, `HOLD` or `REVIEW`—with a receipt explaining the decision.

### Primary value proposition

> **Decide whether a release can proceed without treating uncertainty as safety.**

### Homepage headline

> **Let evidence set the threshold.**

### Homepage supporting headline

> Limen combines what your repository knows with independently routed Telegraph CVE evidence, then tells your CI whether this release can proceed, must stop or needs human review.

### Primary CTA

`Run a release check`

### Secondary CTA

`Inspect the proof`

### Short pitch

> Your CI already asks whether the tests passed. Limen asks whether this release has enough trusted evidence to leave the repository.

### Maintainer pitch

> Stop treating vulnerability alerts as release decisions. Limen combines your repository’s actual dependency exposure with an independently routed CVE lookup and leaves a receipt explaining exactly why the release passed, held or needs review.

### Engineering-lead pitch

> Limen gives small engineering teams a deterministic release boundary. It checks the dependency context in the repository, obtains routed Telegraph evidence and applies explicit policy instead of forcing an engineer to interpret another noisy alert under pressure.

### Security-team pitch

> Limen does not replace your security sources. It adds a policy-backed decision layer that preserves source boundaries, exposes uncertainty and records the evidence behind a release outcome.

### Investor or judge pitch

> Limen is the demand-side application for Telegraph’s routed intelligence layer. It sends real paid `CVE_LOOKUP` requests during dependency-sensitive release checks, preserves provider provenance where exposed and turns the result into a deterministic `PASS`, `HOLD` or `REVIEW` that a GitHub workflow can enforce.

### README description

> Limen is a release-evidence gate for dependency-sensitive software changes. It combines repository exposure facts with routed Telegraph CVE evidence, applies a declared policy and returns an explicit `PASS`, `HOLD` or `REVIEW` with a shareable receipt.

### GitHub Action description

> Evaluate dependency-sensitive pull requests with repository facts, routed Telegraph evidence and an explicit policy-backed release decision.

## 7. Feature-to-value translation

| Feature | Functional result | Practical outcome | Emotional meaning |
|---|---|---|---|
| GitHub / Dependabot adapter | Limen knows the package, version, scope and relationship in this repository. | The gate evaluates the actual change rather than a generic advisory. | “This decision understands my project.” |
| Paid Telegraph `CVE_LOOKUP` | A routed second-source signal is obtained with operational metadata. | The team can see what was requested, paid for and returned. | “The evidence is not a black box.” |
| Deterministic policy | Evidence is compared against declared repository rules. | The same facts produce the same outcome. | “I know who owns the decision.” |
| `PASS` / `HOLD` / `REVIEW` | Every run ends in an explicit state. | Engineers know whether to merge, stop or investigate. | “Uncertainty has a next action.” |
| Evidence ledger | The decision and provenance persist beyond the workflow log. | Teams can audit, share and revisit the release context. | “The decision will still make sense later.” |
| Duplicate suppression | One relevant CVE does not create needless repeated paid calls in a workflow. | Usage stays legitimate and costs remain bounded. | “The system is disciplined.” |
| Shareable receipt | A stable route explains the result without exposing secrets. | Judges, teammates and reviewers can verify the claim. | “The proof travels with the decision.” |
| Policy versioning | A result records which policy produced it. | Teams can understand a decision even after policy changes. | “The rule is visible, not implied.” |
| Bounded retry and typed failure | Temporary external failure is handled explicitly. | The release does not silently pass because a provider was unavailable. | “The system is honest about its limits.” |

## 8. Audience message matrix

### Primary user: maintainer or merging engineer

| Need | Message | Proof or product surface |
|---|---|---|
| Know whether to merge | “Limen gives you a clear `PASS`, `HOLD` or `REVIEW`.” | GitHub check summary. |
| Avoid alert interpretation under pressure | “The decision comes with a plain-language reason and next action.” | Decision header. |
| Trust project context | “Repository facts remain visible alongside external evidence.” | Evidence detail. |
| Recover from uncertainty | “`REVIEW` tells you what is missing or conflicting.” | Review state and receipt. |
| Explain the choice later | “Open the receipt to see what the release check evaluated.” | Stable receipt route. |

### Economic buyer: engineering or platform lead

| Need | Message | Proof or product surface |
|---|---|---|
| Reduce release risk without adding a specialist to every PR | “Turn dependency uncertainty into a repeatable policy decision.” | Policy configuration and CI checks. |
| Maintain team consistency | “The same facts produce the same outcome under the declared policy.” | Deterministic reason codes. |
| Avoid new alert noise | “Limen is a decision layer, not another unowned dashboard.” | Three-state workflow. |
| Demonstrate governance | “Every outcome leaves an evidence-backed receipt.” | Ledger and receipt. |
| Control cost | “Duplicate suppression and bounded retries keep usage disciplined.” | Usage surface and request records. |

### Influencer: security or compliance-minded reviewer

| Need | Message | Proof or product surface |
|---|---|---|
| Understand source boundaries | “Limen separates repository facts from routed external evidence.” | Evidence source labels. |
| Avoid overclaiming | “Missing or conflicting evidence becomes `REVIEW`, not a green light.” | Policy outcome. |
| Verify protocol use | “The request, payment, Intent, route and timing can be inspected where exposed.” | Telegraph proof record. |
| Reconstruct a release decision | “Policy version, checks, timestamps and provenance remain together.” | Receipt. |

### Gatekeeper: repository permissions and CI policy

| Need | Message | Proof or product surface |
|---|---|---|
| Enforce a release rule | “Declare what blocks a production release.” | `limen.yml`. |
| Keep integration simple | “The Action consumes one canonical decision object.” | GitHub Action implementation. |
| Fail safely | “Provider failure becomes `REVIEW`, never silent `PASS`.” | Typed failure path. |
| Limit permissions | “Install with least-privilege repository access.” | Setup documentation. |

## 9. Jobs-to-be-done

### Functional job

> When a dependency-sensitive change reaches a pull request or release workflow, help me decide whether it can proceed under the repository’s policy using evidence specific to this project.

### Emotional job

> Help me feel calm and in control when the evidence is incomplete, because I can see what is known, what is uncertain and what action is required.

### Social job

> Help me show teammates, reviewers and customers that a release decision was evidence-led, policy-backed and honest about uncertainty.

### Job story

> When a dependency-sensitive release is ready to merge, I want a clear, explainable decision based on repository context and an independent routed signal, so I can proceed, stop or investigate without guessing.

## 10. Strategic narrative

Use this narrative for the homepage, pitch deck and spoken demo.

### 1. The relevant change

Software teams ship faster, depend on more external packages and increasingly rely on automated release workflows. A green test suite proves that the code behaved under the tests. It does not by itself establish that the release has enough security evidence to cross into production.

### 2. The winners and losers

Teams that treat every signal as a vague alert either slow down unnecessarily or learn to ignore warnings. Teams that treat missing evidence as safety can authorize a release without knowing what happened. The advantage goes to teams that make the permission boundary explicit.

### 3. The promised land

A maintainer can open a pull request and see:

- what the repository is actually exposed to;
- what routed external evidence returned;
- which policy rule applies;
- whether the outcome is `PASS`, `HOLD` or `REVIEW`; and
- what to do next.

The decision is fast enough for CI and clear enough to audit later.

### 4. The enabling capabilities

- repository-specific exposure extraction;
- a real paid Telegraph `CVE_LOOKUP` request;
- normalized source-separated evidence;
- deterministic policy evaluation;
- explicit three-state outcome;
- a persistent evidence ledger; and
- a safe shareable receipt.

### 5. The enemy

The enemy is not one provider or one scanner. It is **silent confidence**: a system that turns incomplete knowledge into an unexamined authorization to ship.

## 11. State language system

The three states are core brand assets. They must remain consistent across the Action, web app, receipt, notifications, documentation and pitch.

### `PASS`

**Definition:** Evidence supports proceeding under the active policy.

**Short label:** `PASS`

**Plain-language reason:** “The available repository and external evidence do not match a blocking policy condition.”

**Next action:** “Merge or continue the release.”

**Do not say:** “The repository is safe.”

**Example:**

> `PASS` — No blocking condition found under production policy. Continue the release.

### `HOLD`

**Definition:** Repository evidence matches a blocking policy condition.

**Short label:** `HOLD`

**Plain-language reason:** “The affected runtime dependency matches a severity or scope rule that blocks this release.”

**Next action:** “Stop, patch or deliberately change the policy.”

**Do not say:** “Your system is compromised.”

**Example:**

> `HOLD` — Lodash `4.17.20` is in runtime scope and matches a `HIGH` severity finding blocked by production policy.

### `REVIEW`

**Definition:** Evidence is missing, conflicting, malformed or unavailable.

**Short label:** `REVIEW`

**Plain-language reason:** “Limen could not establish sufficient agreement to authorize this release.”

**Next action:** “Investigate the evidence or rerun the check.”

**Do not say:** “Probably safe” or “warning only.”

**Example:**

> `REVIEW` — Telegraph evidence is incomplete. Limen did not convert missing information into a release approval.

### State copy rules

- Always show the state word.
- Always show the reason.
- Always show the next action.
- Never use colour alone.
- Never use `REVIEW` as a euphemism for a hidden failure.
- Never use `PASS` as a claim of universal safety.
- Never use `HOLD` as an alarmist catastrophe message.

## 12. Product and interface copy

### Landing page flow

#### Hero badge

`RELEASE EVIDENCE GATE`

#### Hero headline

> **Let evidence set the threshold.**

#### Hero support

> Limen combines repository facts with independently routed Telegraph CVE evidence, then tells your CI whether this release can proceed, must stop or needs human review.

#### Hero CTAs

- Primary: `Run a release check`
- Secondary: `Inspect the proof`

#### Proof row

`GITHUB` · `DEPENDABOT` · `TELEGRAPH` · `BASE SEPOLIA`

Use only verified integration labels or approved marks. Do not imply endorsement or partnership without evidence.

### Problem section

**Headline:**

> A vulnerability alert is not a release decision.

**Body:**

> It may tell you that a package is affected. It may not tell you whether this exact repository is exposed, whether the evidence agrees or what your policy says to do next. Limen turns that uncertainty into an explicit release state.

### How-it-works section

**Headline:**

> Four sources of clarity. One release decision.

**Steps:**

1. **Read the repository** — identify package, version, scope and release context.
2. **Route the evidence** — request a paid `CVE_LOOKUP` signal through Telegraph.
3. **Apply the policy** — compare the source-specific evidence against declared rules.
4. **Leave the receipt** — record the decision, provenance and next action.

### Decision section

**Headline:**

> Not every uncertain release should pass. Not every alert should block.

**Body:**

> `PASS`, `HOLD` and `REVIEW` give each release a state the team can act on. The reason is visible. The policy is visible. The uncertainty is visible.

### Receipt section

**Headline:**

> The decision should still make sense tomorrow.

**Body:**

> Limen keeps the release context, evidence sources, policy version, checks, timestamps and routed request details together in a shareable receipt.

### Final CTA

**Headline:**

> Give your next release a threshold.

**CTA:**

`Run a release check`

**Supporting link:**

`Inspect the proof`

### Navigation labels

Prefer:

- `Overview`
- `Repositories`
- `Decisions`
- `Evidence ledger`
- `Usage`
- `Setup`

Avoid vague labels such as `Platform`, `Solutions`, `Resources` or `Explore` when a direct label is available.

## 13. GitHub and workflow copy

### Pull-request summary: `PASS`

```text
Limen: PASS

This release can proceed under the active policy.

Why:
- Repository evidence did not match a blocking condition.
- Telegraph CVE evidence produced no material conflict.

Next: merge or continue the release.
Receipt: /r/LM-92K8F21
```

### Pull-request summary: `HOLD`

```text
Limen: HOLD

This release is blocked by the active policy.

Why:
- Package: lodash@4.17.20
- Scope: runtime
- Finding: HIGH severity
- Rule: production.block_severity

Next: patch the dependency, investigate the finding or deliberately change policy.
Receipt: /r/LM-92K8F21
```

### Pull-request summary: `REVIEW`

```text
Limen: REVIEW

This release needs human review before it can proceed.

Why:
- External evidence was incomplete, conflicting or unavailable.
- Limen did not treat missing evidence as approval.

Next: inspect the evidence, resolve the conflict or rerun the check.
Receipt: /r/LM-92K8F21
```

### GitHub check descriptions

- `Limen PASS — release evidence supports proceeding`
- `Limen HOLD — blocking policy condition found`
- `Limen REVIEW — evidence requires human investigation`

### Setup copy

**Heading:**

> Add a release threshold to your repository.

**Body:**

> Install the Limen Action, declare the small set of rules that matter to your production releases and run the check on a real dependency-sensitive change.

**Least-privilege note:**

> Limen should request only the repository permissions required to read the release context and publish the check result. Never add credentials or payment secrets to the repository unless the integration explicitly requires them and the storage path is documented.

## 14. Receipt language

### Receipt title

`Limen release receipt`

### Receipt subtitle

`Evidence-backed decision for a dependency-sensitive release`

### Required receipt labels

- `Decision`
- `Release context`
- `Repository evidence`
- `Telegraph evidence`
- `Policy evaluation`
- `Request timeline`
- `Cost`
- `Latency`
- `Provenance`
- `Next action`

### Receipt introduction

> This receipt records what Limen evaluated, which evidence was available, which policy was applied and why the release received its outcome.

### Receipt disclaimer

> A `PASS` means the available evidence supports proceeding under the recorded policy. It is not a universal guarantee that the repository is free of vulnerabilities.

### Safe sharing language

> Share this receipt to explain the decision. Sensitive credentials, private payment material and reusable secrets are not part of the public record.

## 15. Objection handling

### “Is Limen a replacement for Dependabot or Snyk?”

**Answer:**

> No. Limen is the decision layer around dependency-sensitive release changes. It uses repository security tooling for exposure context, adds routed Telegraph evidence and applies the repository’s policy to return an explicit outcome.

### “Why pay for another CVE lookup?”

**Answer:**

> The value is not another opaque lookup. The request creates a routed, economically real evidence path with operational metadata that can be inspected and included in the release receipt.

### “Why should an uncertain result become `REVIEW`?”

**Answer:**

> Because provider failure or missing evidence is not proof that the release is safe. `REVIEW` preserves the uncertainty and tells a human what needs investigation.

### “Will Limen block too many releases?”

**Answer:**

> `HOLD` should occur only when repository facts match a declared blocking policy condition. Material disagreement or incomplete external evidence becomes `REVIEW`, so the team can distinguish a policy block from an evidence gap.

### “What if the external provider is wrong?”

**Answer:**

> Limen keeps the external result separate from repository facts. Identity or material severity conflicts become `REVIEW` unless the declared policy explicitly says otherwise.

### “Does `PASS` mean the release is secure?”

**Answer:**

> No. It means the available evidence supports proceeding under the recorded policy. Limen is an evidence and decision boundary, not a universal exploitability oracle.

### “Why use Telegraph?”

**Answer:**

> Telegraph gives Limen a real routed intelligence path at the moment a release needs evidence. It makes request, payment, routing and response part of an inspectable application workflow rather than invisible infrastructure.

### “Is Limen an AI security agent?”

**Answer:**

> No. The release decision is deterministic. External intelligence can be routed into the workflow, but the policy outcome remains explicit, reproducible and bounded by the evidence available.

## 16. Verbal identity

### Voice

Limen is **calmly exact**: protective without being alarmist, technical without performing jargon and confident without pretending to know more than the evidence supports.

### Voice principles

#### Principle 1 — Calmly exact

**Means:** State what the system knows, what it does not know and what happens next.

**Sounds like:**

> “The repository is affected. Telegraph evidence is incomplete. Policy requires review.”

**Does not sound like:**

> “Critical threat detected! Your release is dangerous!”

**Before:**

> “Our intelligent security layer gives you complete confidence.”

**After:**

> “Limen shows the evidence behind the decision and makes uncertainty explicit.”

#### Principle 2 — Protective, not alarmist

**Means:** Take risk seriously without turning every finding into panic.

**Sounds like:**

> “HOLD — the runtime dependency is affected and your policy blocks high severity.”

**Does not sound like:**

> “STOP EVERYTHING. YOUR CODE IS COMPROMISED.”

**Before:**

> “This vulnerability could destroy your production environment.”

**After:**

> “This release is held because the affected runtime dependency matches a blocking policy rule.”

#### Principle 3 — Evidence before assertion

**Means:** Put source, timestamp, policy and check in view before adjectives.

**Sounds like:**

> “Repository evidence: Lodash 4.17.20 in runtime scope. Telegraph: CVE-2021-23337, HIGH, routed result.”

**Does not sound like:**

> “Limen’s AI thinks this looks bad.”

#### Principle 4 — Developer-native, not developer-theatre

**Means:** Use precise workflow language without unnecessary jargon.

**Sounds like:**

> “The GitHub check returned `HOLD`. Open the receipt to see the policy rule and evidence.”

**Does not sound like:**

> “Orchestrate next-generation DevSecOps intelligence across your software lifecycle.”

#### Principle 5 — Honest about limits

**Means:** State what Limen does not prove.

**Sounds like:**

> “`PASS` means the available evidence supports proceeding under this policy. It does not certify the repository as vulnerability-free.”

**Does not sound like:**

> “Your code is now fully secure.”

### Tone by context

| Context | Tone | Language behaviour |
|---|---|---|
| Homepage | Calm, direct, confident | Lead with the release decision and outcome. |
| Onboarding | Reassuring, instructive | Explain the smallest next step. |
| `PASS` | Quietly positive | Confirm what supports proceeding; do not overclaim. |
| `HOLD` | Firm, useful | Name the blocking condition and the recovery path. |
| `REVIEW` | Transparent, non-punitive | Name the uncertainty and what must be checked. |
| Error | Plain, accountable | Explain what failed; never disguise failure as safety. |
| Documentation | Precise, practical | Show inputs, outputs, limitations and examples. |
| Hackathon demo | Energetic but factual | Make the live request and consequence visible. |
| Social | Observant, concise | Share a decision or proof, not empty shipping theatre. |
| Incident/outage | Direct, accountable | State impact, current behaviour, workaround and next update. |

### Cadence

- Prefer short declarative sentences.
- Put the state or action first.
- Use one idea per sentence in workflow copy.
- Use a colon to introduce evidence, not hype.
- Use parenthetical qualifiers when they protect accuracy.
- Keep the main claim visible before the technical detail.
- Let the evidence carry authority; do not inflate the adjectives.

### Vocabulary bank

#### Prefer

`evidence`, `repository facts`, `routed`, `provenance`, `policy`, `threshold`, `decision`, `receipt`, `release`, `affected`, `patched`, `missing`, `conflict`, `review`, `hold`, `pass`, `source`, `timestamp`, `cost`, `latency`, `Miner`, `Intent`, `runtime scope`, `next action`.

#### Use carefully

`trust`, `secure`, `verified`, `independent`, `intelligence`, `confidence`, `automation`.

Each needs a specific qualifier or supporting proof. For example:

- “independently routed evidence” is specific;
- “independent security truth” is not;
- “policy-backed decision” is specific;
- “verified release” requires clarification of what was verified.

#### Avoid

`military-grade`, `bulletproof`, `zero risk`, `complete protection`, `AI-powered security revolution`, `unbreakable`, `instant certainty`, `seamless`, `next-generation`, `all-in-one`, `blockchain security`, `magic`, `autonomous approval`, `best-in-class`, `future-proof`.

### Product naming rules

| Name | Meaning and use |
|---|---|
| **Limen** | Master brand. Always capitalized. |
| **Limen Gate** | The CI/release decision surface. Use only when a distinct product surface needs a name. |
| **Limen Policy** | Repository policy configuration and rules. |
| **Limen Evidence** | Evidence and provenance layer. |
| **Limen Receipt** | Stable shareable decision record. |
| **Limen Review** | Human investigation state or workflow. |
| **Limen Signals** | Future routed intelligence layer. |

Do not create a separate product name for every feature. A feature earns a name only when it has a meaningful user-facing workflow and enough strategic weight to justify memory overhead.

### Capitalization rules

- Write `Limen` as the brand name.
- Write `PASS`, `HOLD` and `REVIEW` in uppercase in interfaces and workflow results.
- Write `CVE_LOOKUP` exactly in protocol/evidence contexts.
- Write `x402` exactly when referring to the payment flow.
- Write `Base Sepolia` with both words capitalized.
- Use sentence case for explanatory copy.
- Use all caps only for short labels, states and protocol identifiers.

## 17. Tagline system

### Primary recommendation

> **Let evidence set the threshold.**

**Job:** Own the category idea and express Limen’s role without promising certainty.

**Why it works:**

- It names the decision moment.
- It gives the brand a memorable threshold metaphor.
- It makes evidence the authority, not the brand’s ego.
- It supports product, pitch and campaign language.
- It remains true when the outcome is `REVIEW` rather than `PASS`.

### Supporting lines

| Line | Job | Recommended use |
|---|---|---|
| **The threshold for trusted releases.** | Category and trust signal. | Homepage support or deck close. |
| **Your release deserves more than a green light.** | Problem agitation. | Campaign headline. |
| **Evidence in. Decision out.** | Concise product behaviour. | Product UI or developer campaign. |
| **Ship when the proof is there.** | Developer-facing action line. | README, social or launch content. |
| **Review is a result, not a failure.** | Trust and safety line. | Review state, documentation and support. |

Do not use all taglines at once. The primary line should remain the stable signature; supporting lines provide context-specific variation.

## 18. Proof and claims discipline

### Claim structure

Every major claim should be supported by:

1. **What Limen does** — the product behaviour.
2. **What the user gains** — the practical outcome.
3. **What can be inspected** — the evidence or record.
4. **What Limen does not prove** — the boundary of the claim.

### Approved claims

- “Limen creates a policy-backed release decision.”
- “Limen uses a real paid, routed Telegraph request in the release workflow.”
- “Limen preserves evidence provenance and operational metadata where exposed.”
- “Limen treats missing, malformed or conflicting evidence as `REVIEW`.”
- “Limen complements repository security tooling rather than replacing it.”
- “Limen leaves a shareable receipt explaining the release outcome.”
- “Limen separates repository facts from external evidence.”

### Claims requiring qualification

- “Trusted release” — qualify as trusted under the available evidence and recorded policy.
- “Independent evidence” — specify that the evidence is independently routed through Telegraph; do not imply universal truth.
- “Verified” — name exactly what was verified.
- “Secure” — describe the particular control or state instead of making a total product claim.
- “Automated” — explain which decision or workflow is automated and where human review remains.

### Forbidden or unsupported claims

- “Limen proves the repository is safe.”
- “Telegraph determines whether a vulnerability is exploitable in this project.”
- “HTTP 200 means the release is approved.”
- “Missing evidence means no vulnerability exists.”
- “Decentralized validators certified the release” unless independently demonstrated for the exact environment.
- “Limen prevents all supply-chain attacks.”
- “Limen guarantees zero false positives.”
- “Limen replaces security teams.”

### Evidence language

Use:

> “The routed result reports `HIGH` severity for the requested CVE.”

Avoid:

> “The network proved your application is exploitable.”

Use:

> “The repository contains the affected package in runtime scope.”

Avoid:

> “The provider confirmed your production system is compromised.”

Use:

> “Limen returned `REVIEW` because the sources did not provide sufficient agreement.”

Avoid:

> “The system was confused by the data.”

## 19. Error, empty and edge-state language

### Telegraph unavailable

**Heading:**

> Telegraph evidence is unavailable.

**Body:**

> Limen could not complete the external evidence request. This is not proof that the release is safe.

**State:** `REVIEW`

**Action:** `Retry the check` or `Inspect the failure`

### Payment challenge failed

**Heading:**

> The evidence request could not be paid.

**Body:**

> The release check reached a payment challenge but could not complete the x402 flow. No release approval was issued.

**State:** `REVIEW`

### Missing provider fields

**Heading:**

> The evidence is incomplete.

**Body:**

> The routed response did not include the fields required for this policy decision. Limen kept the missing information visible instead of guessing.

**State:** `REVIEW`

### Conflicting CVE identity or severity

**Heading:**

> The evidence does not agree.

**Body:**

> Repository and external evidence disagree on a material identity or severity field. Review the sources before allowing the release to proceed.

**State:** `REVIEW`

### No vulnerability found

**Heading:**

> No blocking condition found.

**Body:**

> The available repository and routed evidence did not match a blocking policy condition. Continue the release under the recorded policy.

**State:** `PASS`

### Empty ledger

**Heading:**

> Your first release decision will appear here.

**Body:**

> Install the Limen Action and run a dependency-sensitive check. The receipt will preserve the evidence and policy behind the result.

**Action:** `Install the Action`

### No connected repository

**Heading:**

> Connect a repository to set the threshold.

**Body:**

> Limen needs repository context before it can evaluate a release. Start with the smallest repository and policy that reflects your production workflow.

**Action:** `Connect a repository`

## 20. Demo and pitch language

### Demo opening

> “A green test suite tells us the code behaved under its tests. It does not tell us whether this dependency-sensitive release has enough evidence to cross into production. Limen is the threshold that makes that decision explicit.”

### Demo sequence

1. Show a real or controlled dependency-sensitive pull request.
2. Show the repository package, version and runtime scope.
3. Start the live Telegraph Engine request.
4. Show the HTTP `402` challenge.
5. Show the x402 payment path on Base Sepolia.
6. Show the retry and routed `CVE_LOOKUP` response.
7. Show source-separated normalized evidence.
8. Show the deterministic policy match.
9. Show `HOLD` in GitHub.
10. Open the receipt and inspect provenance.
11. Show a patched or unaffected case producing `PASS`.
12. Show an incomplete or conflicting case producing `REVIEW`.

### Demo narration for `HOLD`

> “The repository tells Limen that this package is installed in runtime scope. Telegraph returns a routed high-severity signal. The production policy blocks that combination, so Limen returns `HOLD` and explains the rule instead of hiding behind a generic alert.”

### Demo narration for `PASS`

> “The repository now shows a patched or unaffected version. The external evidence does not create a material conflict, so the same policy produces `PASS`.”

### Demo narration for `REVIEW`

> “The evidence is incomplete or conflicting. Limen does not turn that absence of agreement into permission. It returns `REVIEW` and tells the maintainer what to investigate.”

### Deck narrative

| Slide | Message |
|---:|---|
| 1 | Let evidence set the threshold. |
| 2 | A vulnerability alert is not a release decision. |
| 3 | Limen combines repository facts with routed Telegraph evidence. |
| 4 | The policy makes the outcome deterministic. |
| 5 | `PASS`, `HOLD` and `REVIEW` make uncertainty actionable. |
| 6 | Every decision leaves a receipt. |
| 7 | Real request → payment → route → evidence → GitHub consequence. |
| 8 | The next release should cross a visible threshold. |

### Build-in-public post framework

Every public post should communicate one of three proofs:

1. **Protocol proof** — request, payment, Intent, route, cost or latency.
2. **Product proof** — a release passed, held or entered review with a receipt.
3. **User proof** — repositories installed, repeat checks or maintainer feedback.

Post template:

> **What changed:** [release/dependency context]
>
> **Limen result:** [`PASS` / `HOLD` / `REVIEW`]
>
> **Why:** [plain-language evidence and policy reason]
>
> **Proof:** [safe receipt or inspectable request detail]
>
> **Next:** [patch, merge, investigate or rerun]

Do not post empty progress updates that only announce that code was written.

## 21. Message testing

### Clarity test

Can a developer understand what Limen does within five seconds?

Desired answer:

> “It evaluates a dependency-sensitive release using repository facts and routed evidence, then returns pass, hold or review.”

### Relevance test

Can the intended maintainer recognise their release moment in the first paragraph?

### Value test

Does the message explain what the team can do differently after using Limen?

### Differentiation test

Could Dependabot, Snyk, a generic vulnerability dashboard or a direct CVE API say the same thing? If yes, the message is not yet distinctive.

### Proof test

Can the claim point to a real repository fact, routed request, policy evaluation, decision object or receipt?

### “Only” test

> Limen is the only release-evidence gate in this message set that combines repository-specific exposure, a paid routed `CVE_LOOKUP` path and an explicit `PASS` / `HOLD` / `REVIEW` outcome with a receipt.

Use this as an internal differentiation test, not as a public superlative unless the competitive claim is independently validated.

### “So what?” test

- “Limen uses routed CVE evidence.”
- So what? The release gets a second evidence path with visible request/provenance details.
- So what? The maintainer can make a more explainable decision under policy.
- So what? The team can proceed, stop or investigate without pretending uncertainty is safety.

### Recall test

After a short demo, ask people to describe Limen without showing the name.

Desired recall:

> “The release gate that combines repository facts with routed evidence and tells you whether to pass, hold or review.”

If people remember only “a security dashboard,” the positioning has failed.

### Behavioural tests

Measure:

- Action installation completion;
- time to first real decision;
- percentage of decisions where the receipt is opened;
- repeat checks from the same repository;
- whether maintainers keep the Action enabled;
- whether users can explain why `REVIEW` is not `PASS`;
- whether users can identify the next action after each state.

## 22. Message governance

### Required on every core surface

- Limen’s category or release-decision role.
- The relevant audience or release moment.
- A concrete outcome.
- A reason to believe.
- A specific next action.

### Required on every decision surface

- `PASS`, `HOLD` or `REVIEW`.
- Plain-language reason.
- Repository context.
- Evidence source distinction.
- Policy rule or policy version.
- Next action.

### Never remove for visual simplicity

- State word.
- Evidence source.
- Timestamp when timing matters.
- Policy reason.
- Missing/conflicting status.
- Receipt access.

### Message ownership

- Product owns state language and workflow clarity.
- Engineering owns technical accuracy and evidence fields.
- Security owns claims boundaries and failure semantics.
- Brand owns consistency, hierarchy and distinctiveness.

## 23. Final recommendation

Adopt the following as Limen’s stable messaging core:

**Name:** Limen

**Descriptor:** Release evidence gate

**Primary tagline:** Let evidence set the threshold.

**One-line description:**

> Limen is a release-evidence gate that turns repository exposure and routed CVE evidence into a policy-backed `PASS`, `HOLD` or `REVIEW`.

**Core message:**

> Limen is the threshold between a tested release and a trusted release.

**Primary CTA:** Run a release check

**Secondary CTA:** Inspect the proof

**Strategic enemy:** Silent confidence—the conversion of incomplete knowledge into an unexamined authorization to ship.

**Highest-leverage communication rule:** Lead with the release permission boundary, not the CVE lookup. Telegraph is the mechanism that makes the evidence path routed and economically real. Limen is the application that makes that mechanism useful.

## Da Vinci verdict

**Strategically strong and ready to systemise.**

- **Strongest asset:** A narrow, real workflow consequence for routed intelligence.
- **Biggest weakness:** Without disciplined category language, Limen will be mistaken for “a vulnerability dashboard with an API call.”
- **Highest-leverage change:** Make the release threshold—not the external lookup—the hero of every message.
- **Recommended direction:** Limen / Release evidence gate / Let evidence set the threshold.
- **Confidence:** High on strategic fit; medium on name availability and market collision until legal, domain and handle checks are completed.
- **Test next:** Put the copy in front of maintainers, run the three-case demo, measure whether users understand `REVIEW` and verify that an independent observer can reproduce the paid Telegraph proof.
