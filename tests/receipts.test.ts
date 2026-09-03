import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLedgerServer } from "../apps/api/src";
import {
  ReceiptConflictError,
  ReceiptRevokedError,
  SupabaseEvidenceReceiptStore,
} from "../apps/api/src";
import type { EvidenceLedger, PersistedRunDetail } from "../packages/ledger/src";
import {
  RECEIPT_SCHEMA_VERSION,
  ReceiptSnapshotSchema,
  canonicalizeJson,
  hashReceiptSnapshot,
  projectReceiptSnapshot,
  type EvidenceReceiptStore,
  type LimenEvidenceReceipt,
} from "../packages/receipts/src";

const BASE_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const RUN_ID = "LM-RUN-TEST-001";
const PUBLISHED_AT = "2026-09-03T10:00:00.000Z";

function makeDetail(): PersistedRunDetail {
  return {
    run: {
      id: RUN_ID,
      repository: "acme/service",
      pullRequestNumber: 42,
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      githubRunId: 123,
      githubRunAttempt: 1,
      githubEvent: "pull_request",
      actor: "octocat",
      policyVersion: "LP-test",
      overallDecision: "HOLD",
      runReasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
      runSummary: "A release is held by a blocking dependency.",
      decisionCount: 1,
      passCount: 0,
      holdCount: 1,
      reviewCount: 0,
      telegraphRequestCount: 1,
      telegraphCostUsd: 0.01,
      evaluatedCves: ["CVE-2021-23337"],
      skippedCves: [],
      isTest: true,
      usageClass: "demo",
      source: "backfill",
      startedAt: PUBLISHED_AT,
      completedAt: "2026-09-03T10:00:01.000Z",
    },
    decisions: [
      {
        id: "decision-internal-1",
        decision: "HOLD",
        reasonCode: "AFFECTED_BLOCKING_DEPENDENCY",
        summary: "The repository contains an affected runtime dependency.",
        cveId: "CVE-2021-23337",
        repositoryEvidence: {
          repository: "acme/service",
          commitSha: HEAD_SHA,
          pullRequestNumber: 42,
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
        telegraphEvidence: {
          cveId: "CVE-2021-23337",
          severity: "HIGH",
          cvssScore: 7.2,
          description: "A routed CVE result.",
          references: ["https://example.test/advisory"],
          affectedVersions: ["<4.17.21"],
          fixedVersions: ["4.17.21"],
          fixAvailable: true,
          intent: "CVE_LOOKUP",
          minerId: "miner-internal-id",
          minerName: "Evidence Miner",
          timestamp: PUBLISHED_AT,
          reasoning: "The routed Miner matched the requested CVE.",
          endpoint: "https://internal.example.test/miner",
          costUsd: 0.01,
          durationMs: 985,
          network: "eip155:84532",
          paymentScheme: "exact",
          requestedAt: null,
          receivedAt: "2026-09-03T10:00:00.985Z",
          raw: {
            paymentSignature: "must-not-be-published",
            providerPayload: "must-not-be-published",
          },
        },
        checks: [
          {
            id: "check-internal-1",
            label: "Blocking severity",
            outcome: "fail",
            evidence: "HIGH matches policy.",
          },
        ],
        evaluatedAt: null,
        policyVersion: "LP-test",
      },
    ],
    telegraphRequests: [
      {
        cveId: "CVE-2021-23337",
        intent: "CVE_LOOKUP",
        minerId: "miner-internal-id",
        minerName: "Evidence Miner",
        costUsd: 0.01,
        durationMs: 985,
        network: "eip155:84532",
        paymentScheme: "exact",
        requestedAt: null,
        receivedAt: "2026-09-03T10:00:00.985Z",
        outcome: "success",
        settlementReference: "private-settlement-reference",
      },
    ],
  };
}

function makeReceipt(): LimenEvidenceReceipt {
  const snapshot = projectReceiptSnapshot(makeDetail());
  return {
    id: "LM-REC-TEST-001",
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    snapshotHash: hashReceiptSnapshot(snapshot),
    publishedAt: PUBLISHED_AT,
    snapshot,
  };
}

describe("receipt projection", () => {
  it("creates a versioned public allowlist without private or internal fields", () => {
    const snapshot = projectReceiptSnapshot(makeDetail());
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe(RECEIPT_SCHEMA_VERSION);
    expect(snapshot.release).toMatchObject({
      repository: "acme/service",
      overallDecision: "HOLD",
      usageClass: "demo",
      source: "backfill",
    });
    expect(snapshot.decisions[0]).toMatchObject({
      decision: "HOLD",
      evaluatedAt: null,
      telegraphEvidence: { requestedAt: null, minerName: "Evidence Miner" },
    });
    expect(snapshot.telegraphRequests[0]?.requestedAt).toBeNull();
    expect(serialized).not.toContain("decision-internal-1");
    expect(serialized).not.toContain("check-internal-1");
    expect(serialized).not.toContain("miner-internal-id");
    expect(serialized).not.toContain("internal.example.test");
    expect(serialized).not.toContain("private-settlement-reference");
    expect(serialized).not.toContain("paymentSignature");
    expect(serialized).not.toContain("providerPayload");
    expect(ReceiptSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("uses stable canonical JSON and changes the hash when public evidence changes", () => {
    expect(canonicalizeJson({ b: 2, a: { d: true, c: "x" } })).toBe(
      '{"a":{"c":"x","d":true},"b":2}',
    );
    const snapshot = projectReceiptSnapshot(makeDetail());
    const reordered = {
      telegraphRequests: snapshot.telegraphRequests,
      decisions: snapshot.decisions,
      release: snapshot.release,
      schemaVersion: snapshot.schemaVersion,
    };
    expect(hashReceiptSnapshot(snapshot)).toBe(hashReceiptSnapshot(reordered));
    expect(hashReceiptSnapshot({
      ...snapshot,
      release: { ...snapshot.release, overallDecision: "REVIEW" },
    })).not.toBe(hashReceiptSnapshot(snapshot));
  });
});

describe("receipt API", () => {
  let server: ReturnType<typeof createLedgerServer> | undefined;

  afterEach(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it("publishes authenticated receipts, serves active receipts publicly, and authenticates revocation", async () => {
    const receipt = makeReceipt();
    const ledger: EvidenceLedger = {
      persistRun: vi.fn(),
      getRun: vi.fn().mockResolvedValue(makeDetail()),
    };
    const receipts: EvidenceReceiptStore = {
      publishReceipt: vi.fn().mockResolvedValue({
        id: receipt.id,
        runId: RUN_ID,
        schemaVersion: receipt.schemaVersion,
        snapshotHash: receipt.snapshotHash,
        publishedAt: receipt.publishedAt,
        revokedAt: null,
        created: true,
      }),
      getReceipt: vi.fn().mockResolvedValue({ status: "active", receipt }),
      revokeReceipt: vi.fn().mockResolvedValue({
        id: receipt.id,
        runId: RUN_ID,
        schemaVersion: receipt.schemaVersion,
        snapshotHash: receipt.snapshotHash,
        publishedAt: receipt.publishedAt,
        revokedAt: "2026-09-03T10:01:00.000Z",
        created: true,
      }),
    };
    server = createLedgerServer({ ledger, receipts, ingestToken: "ingest-secret" });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;

    const missingToken = await fetch(`${url}/v1/receipts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: RUN_ID }),
    });
    expect(missingToken.status).toBe(401);

    const published = await fetch(`${url}/v1/receipts`, {
      method: "POST",
      headers: { authorization: "Bearer ingest-secret", "content-type": "application/json" },
      body: JSON.stringify({ runId: RUN_ID }),
    });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ id: receipt.id, created: true });
    expect(receipts.publishReceipt).toHaveBeenCalledWith({
      runId: RUN_ID,
      snapshot: receipt.snapshot,
      snapshotHash: receipt.snapshotHash,
    });

    const publicRead = await fetch(`${url}/v1/receipts/${receipt.id}`);
    expect(publicRead.status).toBe(200);
    expect(await publicRead.json()).toEqual(receipt);

    const revokeMissingToken = await fetch(`${url}/v1/receipts/${receipt.id}/revoke`, {
      method: "POST",
    });
    expect(revokeMissingToken.status).toBe(401);

    const revoked = await fetch(`${url}/v1/receipts/${receipt.id}/revoke`, {
      method: "POST",
      headers: { authorization: "Bearer ingest-secret" },
    });
    expect(revoked.status).toBe(200);
  });

  it("returns 410 without exposing the revoked snapshot", async () => {
    const receipt = makeReceipt();
    const ledger: EvidenceLedger = { persistRun: vi.fn(), getRun: vi.fn() };
    const receipts: EvidenceReceiptStore = {
      publishReceipt: vi.fn(),
      getReceipt: vi.fn().mockResolvedValue({
        status: "revoked",
        receipt: { id: receipt.id, revokedAt: "2026-09-03T10:01:00.000Z" },
      }),
      revokeReceipt: vi.fn(),
    };
    server = createLedgerServer({ ledger, receipts, ingestToken: "ingest-secret" });
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/v1/receipts/${receipt.id}`);
    expect(response.status).toBe(410);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ code: "RECEIPT_REVOKED", message: "The receipt has been revoked." });
    expect(JSON.stringify(body)).not.toContain("snapshot");
  });
});

describe("Supabase receipt repository boundary", () => {
  it("publishes only the validated snapshot and maps a safe response", async () => {
    const receipt = makeReceipt();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: receipt.id,
        runId: RUN_ID,
        schemaVersion: receipt.schemaVersion,
        snapshotHash: receipt.snapshotHash,
        publishedAt: receipt.publishedAt,
        revokedAt: null,
        created: true,
      },
      error: null,
    });
    const repository = new SupabaseEvidenceReceiptStore({ rpc } as unknown as SupabaseClient);

    await expect(repository.publishReceipt({
      runId: RUN_ID,
      snapshot: receipt.snapshot,
      snapshotHash: receipt.snapshotHash,
    })).resolves.toMatchObject({ id: receipt.id, created: true });
    expect(rpc).toHaveBeenCalledWith("publish_limen_receipt", expect.objectContaining({
      input_run_id: RUN_ID,
      input_schema_version: RECEIPT_SCHEMA_VERSION,
      input_snapshot_hash: receipt.snapshotHash,
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("paymentSignature");
  });

  it("maps exact publication conflicts and revoked errors", async () => {
    const receipt = makeReceipt();
    const conflict = new SupabaseEvidenceReceiptStore({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "P0002", message: "Receipt publication conflicts with an existing snapshot." },
      }),
    } as unknown as SupabaseClient);
    await expect(conflict.publishReceipt({
      runId: RUN_ID,
      snapshot: receipt.snapshot,
      snapshotHash: receipt.snapshotHash,
    })).rejects.toThrowError(ReceiptConflictError);

    const revoked = new SupabaseEvidenceReceiptStore({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "P0003", message: "Receipt is revoked and cannot be republished." },
      }),
    } as unknown as SupabaseClient);
    await expect(revoked.publishReceipt({
      runId: RUN_ID,
      snapshot: receipt.snapshot,
      snapshotHash: receipt.snapshotHash,
    })).rejects.toThrowError(ReceiptRevokedError);
  });

  it("returns active receipts, revoked markers, and validates stored hashes", async () => {
    const receipt = makeReceipt();
    const makeClient = (row: Record<string, unknown>) => ({
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      })),
    });
    const active = new SupabaseEvidenceReceiptStore(makeClient({
      id: receipt.id,
      schema_version: receipt.schemaVersion,
      snapshot_hash: receipt.snapshotHash,
      published_at: receipt.publishedAt,
      snapshot: receipt.snapshot,
      revoked_at: null,
    }) as unknown as SupabaseClient);
    await expect(active.getReceipt(receipt.id)).resolves.toEqual({
      status: "active",
      receipt,
    });

    const revoked = new SupabaseEvidenceReceiptStore(makeClient({
      id: receipt.id,
      revoked_at: "2026-09-03T10:01:00.000Z",
    }) as unknown as SupabaseClient);
    await expect(revoked.getReceipt(receipt.id)).resolves.toEqual({
      status: "revoked",
      receipt: { id: receipt.id, revokedAt: "2026-09-03T10:01:00.000Z" },
    });
  });

  it("declares the additive schema, server-only permissions, and RPC boundaries", async () => {
    const migration = await readFile(
      "supabase/migrations/20260902030000_create_evidence_receipts.sql",
      "utf8",
    );
    expect(migration).toContain("create table if not exists public.receipts");
    expect(migration).toContain("unique references public.runs(id) on delete cascade");
    expect(migration).toContain("snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$')");
    expect(migration).toContain("alter table public.receipts enable row level security");
    expect(migration).toContain("revoke all on table public.receipts from anon, authenticated");
    expect(migration).toContain("publish_limen_receipt");
    expect(migration).toContain("revoke_limen_receipt");
    expect(migration).toContain("revoke execute on function public.publish_limen_receipt");
    expect(migration).toContain("grant execute on function public.revoke_limen_receipt(text) to service_role");
  });
});
