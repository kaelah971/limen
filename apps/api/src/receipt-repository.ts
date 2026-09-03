import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ReceiptIdParamSchema,
  ReceiptPublicationSchema,
  ReceiptSchema,
  ReceiptSnapshotSchema,
  hashReceiptSnapshot,
  type EvidenceReceiptStore,
  type ReceiptId,
  type ReceiptLookup,
  type ReceiptPublication,
  type ReceiptPublicationInput,
} from "../../../packages/receipts/src";

const RECEIPT_CONFLICT_CODE = "P0002";
const RECEIPT_CONFLICT_MESSAGE = "Receipt publication conflicts with an existing snapshot.";
const RECEIPT_REVOKED_CODE = "P0003";
const RECEIPT_REVOKED_MESSAGE = "Receipt is revoked and cannot be republished.";
const RECEIPT_NOT_FOUND_CODE = "P0004";
const RECEIPT_NOT_FOUND_MESSAGE = "Receipt was not found.";

export class ReceiptConflictError extends Error {
  readonly code = "RECEIPT_PUBLICATION_CONFLICT" as const;

  constructor() {
    super("This run already has a different published receipt snapshot.");
    this.name = "ReceiptConflictError";
  }
}

export class ReceiptRevokedError extends Error {
  readonly code = "RECEIPT_REVOKED" as const;

  constructor() {
    super("This receipt has been revoked and cannot be republished.");
    this.name = "ReceiptRevokedError";
  }
}

export class ReceiptNotFoundError extends Error {
  readonly code = "RECEIPT_NOT_FOUND" as const;

  constructor() {
    super("The receipt was not found.");
    this.name = "ReceiptNotFoundError";
  }
}

export class ReceiptPersistenceError extends Error {
  readonly code = "RECEIPT_PERSISTENCE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReceiptPersistenceError";
  }
}

function objectRow(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapPublication(value: unknown): ReceiptPublication {
  const parsed = ReceiptPublicationSchema.safeParse(value);
  if (!parsed.success) {
    throw new ReceiptPersistenceError("The receipt store returned an invalid publication result.");
  }
  return parsed.data;
}

function mapActiveReceipt(value: unknown) {
  const row = objectRow(value);
  const parsed = ReceiptSchema.safeParse({
    id: row.id,
    schemaVersion: row.schema_version,
    snapshotHash: row.snapshot_hash,
    publishedAt: row.published_at,
    snapshot: row.snapshot,
  });
  if (!parsed.success || hashReceiptSnapshot(parsed.data.snapshot) !== parsed.data.snapshotHash) {
    throw new ReceiptPersistenceError("The receipt store returned an invalid public receipt.");
  }
  return parsed.data;
}

function mapRpcError(error: { code?: string; message?: string }): Error {
  if (error.code === RECEIPT_CONFLICT_CODE && error.message === RECEIPT_CONFLICT_MESSAGE) {
    return new ReceiptConflictError();
  }
  if (error.code === RECEIPT_REVOKED_CODE && error.message === RECEIPT_REVOKED_MESSAGE) {
    return new ReceiptRevokedError();
  }
  if (error.code === RECEIPT_NOT_FOUND_CODE && error.message === RECEIPT_NOT_FOUND_MESSAGE) {
    return new ReceiptNotFoundError();
  }
  return new ReceiptPersistenceError("The evidence receipt store is unavailable.");
}

export class SupabaseEvidenceReceiptStore implements EvidenceReceiptStore {
  constructor(private readonly client: SupabaseClient) {}

  async publishReceipt(input: ReceiptPublicationInput): Promise<ReceiptPublication> {
    const snapshot = ReceiptSnapshotSchema.safeParse(input.snapshot);
    if (!snapshot.success || hashReceiptSnapshot(snapshot.data) !== input.snapshotHash) {
      throw new ReceiptPersistenceError("The receipt snapshot hash is invalid.");
    }

    const { data, error } = await this.client.rpc("publish_limen_receipt", {
      input_run_id: input.runId,
      input_schema_version: snapshot.data.schemaVersion,
      input_snapshot: snapshot.data,
      input_snapshot_hash: input.snapshotHash,
    });
    if (error) {
      throw mapRpcError(error);
    }
    return mapPublication(data);
  }

  async getReceipt(id: ReceiptId): Promise<ReceiptLookup> {
    if (!ReceiptIdParamSchema.safeParse(id).success) {
      return null;
    }

    const { data, error } = await this.client
      .from("receipts")
      .select("id, schema_version, snapshot_hash, published_at, snapshot, revoked_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new ReceiptPersistenceError("The evidence receipt could not be read.");
    }
    if (data === null) {
      return null;
    }

    const row = objectRow(data);
    if (row.revoked_at !== null && row.revoked_at !== undefined) {
      if (typeof row.revoked_at !== "string") {
        throw new ReceiptPersistenceError("The receipt store returned an invalid revocation time.");
      }
      return {
        status: "revoked",
        receipt: {
          id,
          revokedAt: row.revoked_at,
        },
      };
    }

    return {
      status: "active",
      receipt: mapActiveReceipt(row),
    };
  }

  async revokeReceipt(id: ReceiptId): Promise<ReceiptPublication> {
    if (!ReceiptIdParamSchema.safeParse(id).success) {
      throw new ReceiptNotFoundError();
    }

    const { data, error } = await this.client.rpc("revoke_limen_receipt", {
      input_receipt_id: id,
    });
    if (error) {
      throw mapRpcError(error);
    }
    return mapPublication(data);
  }
}
