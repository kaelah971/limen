import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH =
  "supabase/migrations/20260905000000_create_github_app_onboarding.sql";

const TABLES = [
  "github_users",
  "github_installations",
  "github_repositories",
  "github_setup_prs",
  "github_webhook_deliveries",
  "repository_evaluations",
] as const;

describe("GitHub App metadata schema", () => {
  it("declares the metadata tables, lifecycle contract, and server-only access boundary", async () => {
    const migration = await readFile(MIGRATION_PATH, "utf8");

    for (const table of TABLES) {
      expect(migration).toMatch(
        new RegExp(`create table if not exists public\\.${table}\\b`),
      );
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }

    for (const lifecycleState of [
      "SETUP_REQUIRED",
      "SETUP_PR_OPEN",
      "CONFIGURED",
      "VERIFIED",
      "NEEDS_ATTENTION",
      "DISCONNECTED",
    ]) {
      expect(migration).toContain(lifecycleState);
    }

    for (const decision of ["PASS", "HOLD", "REVIEW"]) {
      expect(migration).toContain(decision);
    }

    expect(migration).toContain(
      "auth_user_id uuid primary key references auth.users(id) on delete cascade",
    );
    expect(migration).toContain(
      "bound_by_auth_user_id uuid null references public.github_users(auth_user_id) on delete set null",
    );
    expect(migration).toContain(
      "unique (repository_id, github_run_id, run_attempt)",
    );
    expect(migration).toContain(
      "where state = 'OPEN'",
    );
    expect(migration).toContain("delivery_id text primary key");
    expect(migration).toContain("workflow_ref text not null");
    expect(migration).toContain("commit_sha text not null");
    expect(migration).toContain(
      "revoke all on table public.github_users, public.github_installations, public.github_repositories, public.github_setup_prs, public.github_webhook_deliveries, public.repository_evaluations from anon, authenticated",
    );

    const columnNames = migration.split("\n").flatMap((line) => {
      const match = line.match(/^\s{2}([a-z][a-z0-9_]*)\s+/i);
      return match?.[1] ? [match[1]] : [];
    });

    expect(columnNames.some((name) =>
      /private_key|installation_token|telegraph_private_key/i.test(name),
    )).toBe(false);
  });
});
