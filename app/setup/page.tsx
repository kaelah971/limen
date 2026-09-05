import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  ACTIVE_HOLD_RECEIPT_ID,
  DEMO_REPOSITORY,
} from "@/app/lib/demo-data";
import {
  CURRENT_ACTION_REFERENCE,
  CURRENT_TELEGRAPH_ENGINE_URL,
  CURRENT_TELEGRAPH_NETWORK,
  CURRENT_WORKFLOW,
  MINIMAL_POLICY,
  RECOMMENDED_POLICY,
} from "@/app/lib/setup-contract";
import { LimenFooter, LimenHeader, PageFrame } from "@/app/components/brand";
import { DecisionBadge } from "@/app/components/decision-badge";
import { SetupCodeBlock } from "@/app/components/setup-code-block";
import { SourceLink } from "@/app/components/evidence-primitives";
import { getPageMetadata } from "@/app/lib/metadata";

export const metadata = getPageMetadata(
  "Set up Limen",
  "Add the Limen GitHub Action, declare a release policy, and configure paid Telegraph evidence.",
  "/setup",
);

const setupSteps = [
  ["01", "GitHub Action", "Install the read-only release gate."],
  ["02", "limen.yml", "Declare what blocks a release."],
  ["03", "Telegraph", "Configure paid routed evidence."],
  ["04", "Pull request", "Run the decision path."],
] as const;

const firstRunSteps = [
  "Open or update a pull request",
  "Limen reads policy from the base SHA",
  "Dependency Review establishes repository context",
  "Relevant CVEs are routed through Telegraph",
  "limen.yml is evaluated",
  "PASS / HOLD / REVIEW appears in the Action result",
  "Optional evidence persistence runs if separately configured",
] as const;

export default function SetupPage() {
  return (
    <PageFrame>
      <LimenHeader />
      <main className="page-main setup-page">
        <div className="content-container">
          <header className="setup-hero page-heading">
            <p className="eyebrow">External maintainer setup</p>
            <h1>SET UP LIMEN</h1>
            <p>Add a release evidence gate to your repository.</p>
            <p className="setup-hero-support">
              Configure the GitHub Action, define your release policy, add the Telegraph credential, then open a pull request.
            </p>
          </header>

          <nav className="setup-step-nav" aria-label="Setup steps">
            {setupSteps.map(([number, title, description]) => (
              <a href={`#setup-step-${number}`} key={number}>
                <span className="setup-step-nav-number">{number}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </a>
            ))}
          </nav>

          <div className="setup-steps">
            <section className="setup-step" id="setup-step-01" aria-labelledby="setup-action-heading">
              <div className="setup-step-marker" aria-hidden="true">01</div>
              <div className="setup-step-content">
                <p className="section-kicker">Step 01 / Install</p>
                <h2 id="setup-action-heading">ADD THE GITHUB ACTION</h2>
                <p>
                  Add this file to the repository that should receive the release gate. Limen uses GitHub APIs and does not checkout the pull request.
                </p>
                <SetupCodeBlock
                  value={CURRENT_WORKFLOW}
                  filename=".github/workflows/limen.yml"
                  label="GitHub Action workflow"
                />
                <div className="setup-explanation-grid">
                  <div>
                    <p className="setup-label">Permission</p>
                    <p><code>contents: read</code> is the minimum permission. The current Action reads the trusted policy and repository evidence with GET requests; it does not write checks, statuses, pull requests, or contents.</p>
                  </div>
                  <div>
                    <p className="setup-label">Why the SHA is full</p>
                    <p><code>{CURRENT_ACTION_REFERENCE}</code> is an immutable commit pin. There is no current Limen tag, release, or Marketplace flow to use instead.</p>
                  </div>
                </div>
                <div className="setup-note setup-note-trust">
                  <strong>Policy trust boundary</strong>
                  <span>Limen reads <code>limen.yml</code> from the trusted base revision. A PR-head policy change cannot modify the policy used for that same evaluation.</span>
                </div>
              </div>
            </section>

            <section className="setup-step" id="setup-step-02" aria-labelledby="setup-policy-heading">
              <div className="setup-step-marker" aria-hidden="true">02</div>
              <div className="setup-step-content">
                <p className="section-kicker">Step 02 / Declare</p>
                <h2 id="setup-policy-heading">ADD <code>limen.yml</code></h2>
                <p>
                  Commit the policy at the repository root on the trusted default branch. <code>limen.yaml</code> is supported only as a fallback when <code>limen.yml</code> is absent.
                </p>
                <SetupCodeBlock
                  value={RECOMMENDED_POLICY}
                  filename="limen.yml"
                  label="recommended Limen policy"
                />
                <div className="setup-rule-grid">
                  <div>
                    <code>block_severity</code>
                    <span>Severities that block a release.</span>
                  </div>
                  <div>
                    <code>dependency_scopes</code>
                    <span>Dependency scopes that are release-relevant.</span>
                  </div>
                  <div>
                    <code>uncertainty fields</code>
                    <span>Currently accept only <code>review</code>.</span>
                  </div>
                </div>
                <div className="setup-validation">
                  <p className="setup-label">Validation is strict</p>
                  <ul>
                    <li>Unknown fields are rejected.</li>
                    <li>Empty arrays are rejected.</li>
                    <li>Duplicate YAML keys are rejected.</li>
                    <li>A malformed policy fails setup; it does not create a release decision.</li>
                    <li>The policy version is derived from canonical content, not formatting.</li>
                  </ul>
                </div>
                <details className="setup-compact-example">
                  <summary>Show the minimal valid policy</summary>
                  <SetupCodeBlock
                    value={MINIMAL_POLICY}
                    filename="limen.yml / minimal"
                    label="minimal Limen policy"
                  />
                </details>
              </div>
            </section>

            <section className="setup-step" id="setup-step-03" aria-labelledby="setup-telegraph-heading">
              <div className="setup-step-marker" aria-hidden="true">03</div>
              <div className="setup-step-content">
                <p className="section-kicker">Step 03 / Evidence</p>
                <h2 id="setup-telegraph-heading">CONFIGURE TELEGRAPH</h2>
                <p>
                  Paid Telegraph lookups use an EVM signing key held by GitHub Actions. Never enter the key on the Limen website.
                </p>
                <div className="setup-config-grid">
                  <div className="setup-config-card">
                    <p className="setup-label">GitHub Secret</p>
                    <SetupCodeBlock
                      value="LIMEN_TELEGRAPH_PRIVATE_KEY"
                      filename="Secret name"
                      label="Telegraph secret name"
                    />
                    <p>An EVM private key in the format <code>0x</code> plus 64 hexadecimal characters. Store it only as a GitHub Actions secret. It is used for paid Telegraph x402 requests and is never rendered or logged by Limen.</p>
                  </div>
                  <div className="setup-config-card">
                    <p className="setup-label">GitHub Variable</p>
                    <SetupCodeBlock
                      value={CURRENT_TELEGRAPH_ENGINE_URL}
                      filename="TELEGRAPH_ENGINE_URL / current value"
                      label="Telegraph Engine variable"
                    />
                    <p>This is the currently validated Telegraph testnet Engine route. It is current setup infrastructure, not a promise of permanent production availability.</p>
                  </div>
                </div>
                <div className="setup-note setup-note-warning" role="note">
                  <strong>TESTNET / DEMO ONLY</strong>
                  <span>This validated Telegraph testnet Engine route currently uses plain HTTP. Do not use this endpoint for production payment traffic. Replace it with an approved production endpoint before production deployment.</span>
                </div>
                <div className="setup-network-row">
                  <span className="context-tag">Base Sepolia</span>
                  <code>{CURRENT_TELEGRAPH_NETWORK}</code>
                  <span>Expected network. This configuration may be omitted because Base Sepolia is the current default.</span>
                </div>
                <div className="setup-note setup-note-hold">
                  <strong>Funding</strong>
                  <span>Use a funded Base Sepolia test wallet for paid Telegraph requests. Limen&apos;s validated demo paid Telegraph requests used USDC on Base Sepolia. The x402 challenge supplies the payment requirement; no permanent asset or amount is promised here.</span>
                </div>
                <p className="setup-security-line">The private key, payment signatures, payment proofs, and ledger credentials do not belong in setup copy, repository files, or website forms.</p>
              </div>
            </section>

            <section className="setup-step" id="setup-step-04" aria-labelledby="setup-run-heading">
              <div className="setup-step-marker" aria-hidden="true">04</div>
              <div className="setup-step-content">
                <p className="section-kicker">Step 04 / Evaluate</p>
                <h2 id="setup-run-heading">OPEN A PULL REQUEST</h2>
                <p>Once the workflow, policy, secret, and variable are in place, open or update a pull request to run the gate.</p>
                <div className="setup-flow" role="group" aria-label="Limen first-run path">
                  <span>Pull request</span>
                  <span>trusted-base policy</span>
                  <span>GitHub dependency evidence</span>
                  <span>relevant CVEs</span>
                  <span>Telegraph CVE_LOOKUP</span>
                  <span>deterministic policy</span>
                  <span>PASS / HOLD / REVIEW</span>
                </div>
                <div className="setup-state-grid">
                  <div className="setup-state-card">
                    <DecisionBadge decision="PASS" />
                    <p>Workflow succeeds. Available evidence supports proceeding under policy.</p>
                  </div>
                  <div className="setup-state-card">
                    <DecisionBadge decision="HOLD" />
                    <p>Workflow fails because blocking repository evidence matched policy.</p>
                  </div>
                  <div className="setup-state-card">
                    <DecisionBadge decision="REVIEW" />
                    <p>Workflow fails because evidence is uncertain, missing, conflicting, or unavailable.</p>
                  </div>
                </div>
                <div className="setup-system-note" role="note">
                  <strong>Setup/system errors are different</strong>
                  <span>A setup failure is not <code>REVIEW</code>. Missing or malformed policy, missing <code>github-token</code>, malformed Action input, invalid Telegraph configuration, or GitHub auth/permission failure stops the Action without fabricating a release decision.</span>
                </div>
                <div className="setup-example-grid">
                  <div>
                    <p className="setup-label">Examples of <code>REVIEW</code></p>
                    <p>Missing Telegraph key for a relevant CVE, Engine unavailable, payment or routing failure, severity/CVE conflict, unknown exposure, or lookup budget exceeded.</p>
                  </div>
                  <div>
                    <p className="setup-label">Forks and Dependabot</p>
                    <p>Normal pull request workflows do not receive repository secrets from forks. A relevant fork or Dependabot PR without the key becomes <code>REVIEW</code>; a PR with no relevant CVE can still pass.</p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="setup-optional" aria-labelledby="setup-optional-heading">
            <div className="section-heading">
              <p className="section-kicker">Optional settings</p>
              <h2 id="setup-optional-heading">Keep the first install small.</h2>
              <p>These settings are optional Action inputs. The normal setup does not require ledger configuration.</p>
            </div>
            <div className="setup-options-grid">
              <div><code>max-lookups</code><span>Defaults to <code>5</code>; accepts integers from <code>1</code> through <code>20</code>.</span></div>
              <div><code>expected-network</code><span>Defaults to <code>{CURRENT_TELEGRAPH_NETWORK}</code>.</span></div>
              <div><code>usage-class</code><span>Accepts <code>production</code>, <code>demo</code>, <code>development</code>, or <code>test</code>; defaults to <code>production</code>.</span></div>
            </div>
            <p className="setup-advanced-note">Evidence ledger persistence is optional and not required to use the Limen Action. Receipt publication is not automatic from the Action.</p>
          </section>

          <section className="setup-first-run" aria-labelledby="setup-next-heading">
            <div className="section-heading">
              <p className="section-kicker">First run expectation</p>
              <h2 id="setup-next-heading">What happens next?</h2>
            </div>
            <ol className="setup-first-run-list">
              {firstRunSteps.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step}</strong>
                </li>
              ))}
            </ol>
          </section>

          <section className="setup-links" aria-labelledby="setup-links-heading">
            <div>
              <p className="section-kicker">Continue with evidence</p>
              <h2 id="setup-links-heading">See the contract in motion.</h2>
              <p>The controlled demo shows a real HOLD path and its public proof. It is not a substitute for configuring your own repository.</p>
            </div>
            <div className="setup-link-list">
              <Link className="button button-primary" href="/demo">View real demo workflow <ArrowRight aria-hidden="true" /></Link>
              <Link className="button button-secondary" href={`/receipt/${ACTIVE_HOLD_RECEIPT_ID}`}>Inspect real proof <ArrowUpRight aria-hidden="true" /></Link>
              <SourceLink href="https://github.com/kaelah971/limen/blob/main/Docs/github-action.md">Read Action docs</SourceLink>
              <SourceLink href="https://github.com/kaelah971/limen">View source</SourceLink>
            </div>
          </section>

          <p className="setup-demo-reference">Reference implementation: <code>{DEMO_REPOSITORY}</code></p>
        </div>
      </main>
      <LimenFooter />
    </PageFrame>
  );
}
