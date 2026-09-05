import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_HOLD_RECEIPT_ID,
  DEMO_HOLD_ACTION_URL,
  DEMO_PASS_ACTION_URL,
  DEMO_PULL_REQUEST_URL,
  DEMO_REPOSITORY,
  HOLD_BASE_SHA,
  HOLD_HEAD_SHA,
  HOLD_SNAPSHOT_HASH,
  REVOKED_PASS_RECEIPT_ID,
} from "../app/lib/demo-data";
import { fetchPublicReceipt, getPublicReceiptApiUrl } from "../app/lib/receipt-api";
import { getPageMetadata, siteMetadata } from "../app/lib/metadata";
import { validationMessage } from "../app/lib/receipt-validation";
import {
  formatCurrency,
  formatEvidenceList,
  formatEvidenceValue,
  formatTimestamp,
  getDecisionReason,
  getNextAction,
  getPrimaryDecision,
  githubPullRequestUrl,
} from "../app/lib/receipt-view";
import {
  RECEIPT_SCHEMA_VERSION,
  hashReceiptSnapshot,
  type LimenEvidenceReceipt,
  type ReceiptSnapshot,
} from "../packages/receipts/src";
import {
  CURRENT_ACTION_REFERENCE,
  CURRENT_TELEGRAPH_ENGINE_URL,
  CURRENT_TELEGRAPH_NETWORK,
  CURRENT_WORKFLOW,
  MINIMAL_POLICY,
  RECOMMENDED_POLICY,
} from "../app/lib/setup-contract";

const HOLD_SNAPSHOT: ReceiptSnapshot = {
  schemaVersion: RECEIPT_SCHEMA_VERSION,
  release: {
    repository: DEMO_REPOSITORY,
    pullRequestNumber: 1,
    baseSha: HOLD_BASE_SHA,
    headSha: HOLD_HEAD_SHA,
    githubEvent: "pull_request",
    actor: "kaelah971",
    policyVersion: "LP-fde4ac5cdba2",
    overallDecision: "HOLD",
    runReasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
    runSummary: "This release matches a blocking dependency policy condition.",
    decisionCount: 1,
    passCount: 0,
    holdCount: 1,
    reviewCount: 0,
    telegraphRequestCount: 1,
    telegraphCostUsd: 0.01,
    evaluatedCves: ["CVE-2021-23337"],
    skippedCves: [],
    usageClass: "demo",
    source: "backfill",
    startedAt: "2026-09-03T10:00:00.000Z",
    completedAt: "2026-09-03T10:00:01.000Z",
  },
  decisions: [
    {
      decision: "HOLD",
      reasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
      summary: "The affected runtime dependency matches a blocking policy rule.",
      cveId: "CVE-2021-23337",
      repositoryEvidence: {
        packageName: "lodash",
        ecosystem: "npm",
        installedVersion: "4.17.20",
        vulnerableRange: "<4.17.21",
        firstPatchedVersion: "4.17.21",
        cveId: "CVE-2021-23337",
        severity: "HIGH",
        cvssScore: 7.2,
        manifestPath: "package-lock.json",
        scope: "runtime",
        relationship: "direct",
        exposureState: "affected",
        source: "github-dependency-review",
      },
      telegraphEvidence: null,
      checks: [],
      evaluatedAt: null,
      policyVersion: "LP-fde4ac5cdba2",
    },
  ],
  telegraphRequests: [],
};

const HOLD_RECEIPT: LimenEvidenceReceipt = {
  id: ACTIVE_HOLD_RECEIPT_ID,
  schemaVersion: RECEIPT_SCHEMA_VERSION,
  snapshotHash: hashReceiptSnapshot(HOLD_SNAPSHOT),
  publishedAt: "2026-09-03T14:33:01.487214+00:00",
  snapshot: HOLD_SNAPSHOT,
};

const PASS_SNAPSHOT: ReceiptSnapshot = {
  ...HOLD_SNAPSHOT,
  release: {
    ...HOLD_SNAPSHOT.release,
    overallDecision: "PASS",
    runReasonCode: "NO_RELEVANT_VULNERABILITY",
    runSummary: "No blocking dependency vulnerability was introduced by this pull request.",
    decisionCount: 0,
    passCount: 0,
    holdCount: 0,
    reviewCount: 0,
    telegraphRequestCount: 0,
    telegraphCostUsd: 0,
    evaluatedCves: [],
  },
  decisions: [],
  telegraphRequests: [],
};

const PASS_RECEIPT: LimenEvidenceReceipt = {
  ...HOLD_RECEIPT,
  id: "LM-REC-PASS-001",
  snapshotHash: hashReceiptSnapshot(PASS_SNAPSHOT),
  snapshot: PASS_SNAPSHOT,
};

const REVIEW_SNAPSHOT: ReceiptSnapshot = {
  ...HOLD_SNAPSHOT,
  release: {
    ...HOLD_SNAPSHOT.release,
    overallDecision: "REVIEW",
    runReasonCode: "SEVERITY_CONFLICT",
    runSummary: "Independent evidence conflicts for this release.",
    holdCount: 0,
    reviewCount: 1,
  },
  decisions: [{
    ...HOLD_SNAPSHOT.decisions[0],
    decision: "REVIEW",
    reasonCode: "SEVERITY_CONFLICT",
    summary: "Repository and routed evidence conflict.",
  }],
};

const REVIEW_RECEIPT: LimenEvidenceReceipt = {
  ...HOLD_RECEIPT,
  id: "LM-REC-REVIEW-001",
  snapshotHash: hashReceiptSnapshot(REVIEW_SNAPSHOT),
  snapshot: REVIEW_SNAPSHOT,
};

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("public receipt API boundary", () => {
  it("requires an explicit public API URL in production", () => {
    expect(() => getPublicReceiptApiUrl({ NODE_ENV: "production" })).toThrow(
      "LIMEN_PUBLIC_API_URL is required in production.",
    );
    expect(getPublicReceiptApiUrl({ NODE_ENV: "development" })).toBe("http://127.0.0.1:8787");
  });

  it("validates and returns an active public HOLD receipt without adding auth", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(200, HOLD_RECEIPT));
    await expect(fetchPublicReceipt(
      ACTIVE_HOLD_RECEIPT_ID,
      fetcher,
      { LIMEN_PUBLIC_API_URL: "https://receipts.example.test/" },
    )).resolves.toEqual({ status: "active", receipt: HOLD_RECEIPT });
    expect(fetcher).toHaveBeenCalledWith(
      `https://receipts.example.test/v1/receipts/${ACTIVE_HOLD_RECEIPT_ID}`,
      { cache: "no-store", headers: { accept: "application/json" } },
    );
  });

  it("preserves 404 and 410 as public lookup states", async () => {
    await expect(fetchPublicReceipt(ACTIVE_HOLD_RECEIPT_ID, vi.fn().mockResolvedValue(response(404, {})), {}))
      .resolves.toEqual({ status: "not_found" });
    await expect(fetchPublicReceipt(ACTIVE_HOLD_RECEIPT_ID, vi.fn().mockResolvedValue(response(410, {})), {}))
      .resolves.toEqual({ status: "revoked" });
  });

  it("accepts active PASS and REVIEW receipts without changing their decisions", async () => {
    await expect(fetchPublicReceipt(PASS_RECEIPT.id, vi.fn().mockResolvedValue(response(200, PASS_RECEIPT)), {}))
      .resolves.toEqual({ status: "active", receipt: PASS_RECEIPT });
    await expect(fetchPublicReceipt(REVIEW_RECEIPT.id, vi.fn().mockResolvedValue(response(200, REVIEW_RECEIPT)), {}))
      .resolves.toEqual({ status: "active", receipt: REVIEW_RECEIPT });
  });

  it("keeps malformed IDs and API failures distinct from decisions", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchPublicReceipt("not-a-receipt", fetcher, {})).resolves.toEqual({ status: "invalid" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(fetchPublicReceipt(ACTIVE_HOLD_RECEIPT_ID, vi.fn().mockResolvedValue(response(503, {})), {}))
      .resolves.toEqual({ status: "error" });
    await expect(fetchPublicReceipt(ACTIVE_HOLD_RECEIPT_ID, vi.fn().mockResolvedValue(response(200, {
      ...HOLD_RECEIPT,
      snapshotHash: "0".repeat(64),
    })), {})).resolves.toEqual({ status: "error" });
    await expect(fetchPublicReceipt(ACTIVE_HOLD_RECEIPT_ID, vi.fn().mockResolvedValue(response(200, { privateKey: "never" })), {}))
      .resolves.toEqual({ status: "error" });
  });
});

describe("P7 receipt presentation semantics", () => {
  it("prioritizes the HOLD decision and derives a factual next action", () => {
    expect(getPrimaryDecision(HOLD_RECEIPT)?.cveId).toBe("CVE-2021-23337");
    expect(getNextAction(HOLD_RECEIPT)).toBe("Update lodash beyond 4.17.21 before releasing.");
    expect(getDecisionReason("HOLD")).toContain("blocking dependency policy condition");
  });

  it("keeps a zero-decision PASS receipt free of fabricated evidence", () => {
    expect(getPrimaryDecision(PASS_RECEIPT)).toBeNull();
    expect(PASS_RECEIPT.snapshot.decisions).toHaveLength(0);
    expect(PASS_RECEIPT.snapshot.telegraphRequests).toHaveLength(0);
    expect(getNextAction(PASS_RECEIPT)).toBe("Continue the release under the recorded policy.");
  });

  it("keeps REVIEW language separate from PASS and preserves unknown values", () => {
    expect(getDecisionReason("REVIEW")).toContain("human review");
    expect(getNextAction({
      ...HOLD_RECEIPT,
      snapshot: { ...HOLD_RECEIPT.snapshot, release: { ...HOLD_RECEIPT.snapshot.release, overallDecision: "REVIEW" } },
    })).toContain("Investigate");
    expect(formatEvidenceValue(null)).toBe("Not available");
    expect(formatEvidenceList(null)).toBe("Not available");
    expect(formatEvidenceList([])).toBe("None recorded");
    expect(formatTimestamp(null)).toBe("Not available");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("validates empty, malformed and valid lookup IDs", () => {
    expect(validationMessage("   ")).toBe("Enter a receipt ID.");
    expect(validationMessage("not-a-receipt")).toContain("doesn’t look like a Limen receipt ID");
    expect(validationMessage(` ${ACTIVE_HOLD_RECEIPT_ID} `)).toBeNull();
    expect(REVOKED_PASS_RECEIPT_ID).toMatch(/^LM-REC-/);
  });

  it("uses safe, inspectable GitHub links and validated demo constants", () => {
    expect(githubPullRequestUrl(HOLD_RECEIPT)).toBe(DEMO_PULL_REQUEST_URL);
    expect(DEMO_HOLD_ACTION_URL).toContain("actions/runs/33654301781");
    expect(DEMO_PASS_ACTION_URL).toContain("actions/runs/33655468552");
    expect(HOLD_SNAPSHOT_HASH).toBe("41cbf844690a2a15bf6d7d0fdc6bfd8bf8ae08cd684d735eb611d069f3ffebdf");
    expect(JSON.stringify(HOLD_RECEIPT)).not.toContain("privateKey");
    expect(JSON.stringify(HOLD_RECEIPT)).not.toContain("minerId");
  });
});

describe("P7 route and accessibility boundaries", () => {
  it("keeps receipt fetching server-side and labels lookup errors", async () => {
    const receiptPage = await readFile("app/receipt/[id]/page.tsx", "utf8");
    const lookupForm = await readFile("app/components/receipt-lookup-form.tsx", "utf8");
    const validation = await readFile("app/lib/receipt-validation.ts", "utf8");
    expect(receiptPage).toContain("fetchPublicReceipt");
    expect(receiptPage).not.toContain("ledger/runs");
    expect(lookupForm).toContain('htmlFor="receipt-id"');
    expect(lookupForm).toContain('aria-required="true"');
    expect(lookupForm).toContain("aria-invalid");
    expect(lookupForm).toContain("aria-errormessage");
    expect(lookupForm).toContain("role=\"alert\"");
    expect(validation).toContain("That doesn’t look like a Limen receipt ID.");

    const receiptSurface = await readFile("app/components/receipt-surface.tsx", "utf8");
    expect(receiptSurface).toContain('className="system-state revoked-state" role="alert"');
    expect(receiptSurface).toContain('className="system-state not-found-state" role="alert"');
  });

  it("keeps client components free of API and private-boundary access", async () => {
    const clientSources = await Promise.all([
      readFile("app/components/receipt-lookup-form.tsx", "utf8"),
      readFile("app/components/copy-button.tsx", "utf8"),
    ]);
    expect(clientSources.join("\n")).not.toContain("fetch(");
    expect(clientSources.join("\n")).not.toMatch(/SUPABASE_|LIMEN_(INGEST|LEDGER)_TOKEN|TELEGRAPH_PRIVATE_KEY/);

    const appSources = await Promise.all([
      readFile("app/receipt/[id]/page.tsx", "utf8"),
      readFile("app/lib/receipt-api.ts", "utf8"),
      readFile("app/lib/metadata.ts", "utf8"),
    ]);
    expect(appSources.join("\n")).not.toContain("ledger/runs");
    expect(appSources.join("\n")).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|LIMEN_INGEST_TOKEN|TELEGRAPH_PRIVATE_KEY|PAYMENT-SIGNATURE/);
    expect(appSources.join("\n")).toContain("/v1/receipts/");
  });

  it("fails closed before rendering demo decisions when the receipt is unavailable", async () => {
    const demoTrace = await readFile("app/components/demo-trace.tsx", "utf8");
    const guardStart = demoTrace.indexOf('if (result.status !== "active")');
    const receiptStart = demoTrace.indexOf("const receipt = result.receipt;");
    const failureGuard = demoTrace.slice(guardStart, receiptStart);

    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(receiptStart).toBeGreaterThan(guardStart);
    expect(failureGuard).toContain("ReceiptErrorState");
    expect(failureGuard).not.toMatch(/\b(PASS|HOLD|REVIEW)\b/);
    expect(demoTrace).toContain("formatEvidenceValue(telegraphEvidence?.network)");
    expect(demoTrace).toContain("formatEvidenceValue(telegraphEvidence?.paymentScheme)");
    expect(demoTrace).not.toContain("telegraphEvidence?.network ??");
    expect(demoTrace).not.toContain("telegraphEvidence?.paymentScheme ??");
    expect(formatEvidenceValue(null)).toBe("Not available");
    expect(formatEvidenceValue(null)).not.toBe("Base Sepolia");
    expect(formatEvidenceValue(null)).not.toBe("exact");
  });

  it("keeps navigation targets and external link semantics explicit", async () => {
    const [home, brand, demo, demoTrace, receipt, evidence] = await Promise.all([
      readFile("app/page.tsx", "utf8"),
      readFile("app/components/brand.tsx", "utf8"),
      readFile("app/demo/page.tsx", "utf8"),
      readFile("app/components/demo-trace.tsx", "utf8"),
      readFile("app/components/receipt-surface.tsx", "utf8"),
      readFile("app/components/evidence-primitives.tsx", "utf8"),
    ]);
    expect(home).toContain('href="/demo"');
    expect(home).toContain("ACTIVE_HOLD_RECEIPT_ID");
    expect(brand).toContain('href="/proof"');
    expect(brand).toContain('href="/setup"');
    expect(brand).toContain('rel="noreferrer noopener"');
    expect(demo).toContain("DEMO_PULL_REQUEST_URL");
    expect(demo).toContain("ACTIVE_HOLD_RECEIPT_ID");
    expect(demoTrace).toContain("DEMO_HOLD_ACTION_URL");
    expect(demoTrace).toContain("DEMO_PASS_ACTION_URL");
    expect(demoTrace).toContain("ACTIVE_HOLD_RECEIPT_ID");
    expect(receipt).toContain("githubPullRequestUrl");
    expect(evidence).toContain('import Link from "next/link"');
    expect(evidence).toContain("/^https?:\\/\\//i.test(href)");
  });

  it("keeps the public setup contract canonical and secret-safe", async () => {
    const [setupPage, setupStyles, readme, actionDocs, exampleWorkflow] = await Promise.all([
      readFile("app/setup/page.tsx", "utf8"),
      readFile("app/globals.css", "utf8"),
      readFile("README.md", "utf8"),
      readFile("Docs/github-action.md", "utf8"),
      readFile("examples/github-actions/limen.yml", "utf8"),
    ]);
    const docs = `${readme}\n${actionDocs}\n${exampleWorkflow}`;

    expect(CURRENT_ACTION_REFERENCE).toBe("kaelah971/limen@a91d36bfe8eaab5d95f791e39449878239bf948d");
    expect(CURRENT_TELEGRAPH_ENGINE_URL).toBe("http://13.237.89.59:7044/engine/v1/ask");
    expect(CURRENT_TELEGRAPH_NETWORK).toBe("eip155:84532");
    expect(CURRENT_WORKFLOW).toContain("pull_request:");
    expect(CURRENT_WORKFLOW).toContain("contents: read");
    expect(CURRENT_WORKFLOW).toContain(`uses: ${CURRENT_ACTION_REFERENCE}`);
    expect(CURRENT_WORKFLOW).toContain("github-token: ${{ github.token }}");
    expect(CURRENT_WORKFLOW).toContain("telegraph-private-key: ${{ secrets.LIMEN_TELEGRAPH_PRIVATE_KEY }}");
    expect(CURRENT_WORKFLOW).toContain("telegraph-engine-url: ${{ vars.TELEGRAPH_ENGINE_URL }}");
    expect(RECOMMENDED_POLICY).toContain("missing_external_evidence: review");
    expect(MINIMAL_POLICY).toContain("block_severity:");

    expect(setupPage).toContain('export const metadata = getPageMetadata(');
    expect(setupPage).toContain("SetupCodeBlock");
    expect(setupPage).toContain("PASS");
    expect(setupPage).toContain("HOLD");
    expect(setupPage).toContain("REVIEW");
    expect(setupPage).toContain("setup failure is not");
    expect(setupPage).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(setupPage).not.toContain("LIMEN_INGEST_TOKEN");
    expect(setupPage).not.toContain("PAYMENT-SIGNATURE");
    expect(setupStyles).toContain(".setup-step-nav");
    expect(setupStyles).toContain(".setup-code-block");
    expect(setupStyles).toContain("@media (max-width: 760px)");
    expect(docs).toContain(CURRENT_ACTION_REFERENCE);
    expect(docs).toContain(CURRENT_TELEGRAPH_ENGINE_URL);
    expect(docs).not.toContain("<owner>");
    expect(docs).not.toContain("<PINNED_REF>");
  });

  it("defines page metadata and uses the existing Limen logo", () => {
    expect(siteMetadata.description).toBeTruthy();
    expect(siteMetadata.icons).toEqual({ icon: "/limen-logo.svg", apple: "/limen-logo.svg" });
    expect(siteMetadata.openGraph).toMatchObject({
      siteName: "Limen",
      title: "Limen | Release evidence gate",
      url: "/",
    });
    expect(siteMetadata.twitter).toMatchObject({ card: "summary" });

    const proofMetadata = getPageMetadata("Inspect proof", "Proof description", "/proof");
    expect(proofMetadata.alternates).toEqual({ canonical: "/proof" });
    expect(proofMetadata.openGraph).toMatchObject({ title: "Inspect proof | Limen", url: "/proof" });
    expect(proofMetadata.twitter).toMatchObject({ title: "Inspect proof | Limen" });

    const setupMetadata = getPageMetadata("Set up Limen", "Setup description", "/setup");
    expect(setupMetadata.alternates).toEqual({ canonical: "/setup" });
    expect(setupMetadata.openGraph).toMatchObject({ title: "Set up Limen | Limen", url: "/setup" });
  });

  it("declares basic public-web security headers", async () => {
    const config = await readFile("next.config.ts", "utf8");
    expect(config).toContain("X-Content-Type-Options");
    expect(config).toContain("nosniff");
    expect(config).toContain("strict-origin-when-cross-origin");
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("connect-src 'self'");
  });

  it("defines the responsive evidence path and reduced-motion behavior", async () => {
    const styles = await readFile("app/globals.css", "utf8");
    expect(styles).toContain(".evidence-path");
    expect(styles).toContain("grid-template-columns: 1fr;");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("min-height: 44px");
  });
});
