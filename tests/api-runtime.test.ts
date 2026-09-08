import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadLedgerApiConfig } from "../apps/api/src/config";
import { createLedgerServer } from "../apps/api/src/server";

const BASE_ENVIRONMENT = {
  SUPABASE_URL: "https://fixture.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-fixture",
  LIMEN_INGEST_TOKEN: "ingest-token-fixture",
};

const servers: ReturnType<typeof createLedgerServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

function loadConfig(overrides: Record<string, string | undefined> = {}) {
  return loadLedgerApiConfig({ ...BASE_ENVIRONMENT, ...overrides });
}

describe("API runtime binding", () => {
  it("prefers PORT over LIMEN_API_PORT and uses 8787 by default", () => {
    expect(loadConfig({ PORT: "49152", LIMEN_API_PORT: "4311" })).toMatchObject({
      port: 49152,
      host: "0.0.0.0",
    });
    expect(loadConfig({ LIMEN_API_PORT: "4311" }).port).toBe(4311);
    expect(loadConfig().port).toBe(8787);
  });

  it("uses an explicit LIMEN_API_HOST and rejects invalid selected ports", () => {
    expect(loadConfig({ LIMEN_API_HOST: "127.0.0.1" }).host).toBe("127.0.0.1");

    for (const PORT of ["", "0", "65536", "1.5", "not-a-port"]) {
      expect(() => loadConfig({ PORT })).toThrow("Ledger API configuration is invalid.");
    }
  });
});

describe("API health endpoint", () => {
  it("returns a minimal unauthenticated readiness response", async () => {
    const server = createLedgerServer({
      ledger: {
        persistRun: async () => ({ id: "LM-RUN-HEALTH-TEST", created: true }),
        getRun: async () => null,
      },
      ingestToken: "ingest-token-fixture",
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
