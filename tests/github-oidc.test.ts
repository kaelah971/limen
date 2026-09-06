import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const EVALUATIONS_SCHEMA_PATH =
  "supabase/migrations/20260905000000_create_github_app_onboarding.sql";
const EVALUATION_MIGRATION_PATH =
  "supabase/migrations/20260906010000_add_atomic_github_evaluation_persistence.sql";

describe("atomic evaluation persistence migration", () => {
  it("defines a service-role-only atomic evaluation persistence RPC", async () => {
    const [schema, migration] = await Promise.all([
      readFile(EVALUATIONS_SCHEMA_PATH, "utf8"),
      readFile(EVALUATION_MIGRATION_PATH, "utf8"),
    ]);
    const normalized = migration.toLowerCase();
    const functionStart = normalized.indexOf(
      "create or replace function public.record_github_evaluation_and_verify",
    );
    const revokeStart = normalized.indexOf(
      "revoke execute on function public.record_github_evaluation_and_verify",
    );
    const functionBody = normalized.slice(functionStart, revokeStart);

    expect(schema).toContain("unique (repository_id, github_run_id, run_attempt)");
    expect(normalized).toMatch(
      /create or replace function public\.record_github_evaluation_and_verify\s*\(\s*p_repository_id\s+bigint\s*,\s*p_github_run_id\s+bigint\s*,\s*p_run_attempt\s+integer\s*,\s*p_workflow_ref\s+text\s*,\s*p_commit_sha\s+text\s*,\s*p_decision\s+text\s*,\s*p_receipt_id\s+text\s*,\s*p_evaluated_at\s+timestamptz\s*\)/i,
    );
    expect(normalized).toContain("returns public.repository_evaluations");
    expect(functionBody).toContain("security definer");
    expect(functionBody).toMatch(/set search_path\s*=\s*pg_catalog\s*,\s*public/);
    expect(functionBody).toMatch(/p_repository_id\s+is null|p_repository_id\s*<=\s*0/);
    expect(functionBody).toMatch(/p_github_run_id\s+is null|p_github_run_id\s*<=\s*0/);
    expect(functionBody).toMatch(/p_run_attempt\s+is null|p_run_attempt\s*<=\s*0/);
    expect(functionBody).toContain("github_evaluation_input_invalid");
    expect(functionBody).toContain("p_decision not in ('pass', 'hold', 'review')");
    expect(functionBody).toMatch(/length\((?:btrim\(p_workflow_ref\)|normalized_workflow_ref)\)\s*=\s*0/);
    expect(functionBody).toMatch(/length\((?:btrim\(p_commit_sha\)|normalized_commit_sha)\)\s*=\s*0/);
    expect(functionBody).toContain("p_evaluated_at is null");
    expect(functionBody).toMatch(/from\s+public\.github_repositories/);
    expect(functionBody).toMatch(/for update/);
    expect(functionBody).toMatch(/from\s+public\.github_installations/);
    expect(functionBody).toContain("connection_state = 'active'");
    expect(functionBody).toContain("github_repository_disconnected");
    expect(functionBody).toMatch(
      /from\s+public\.repository_evaluations[\s\S]*github_run_id[\s\S]*run_attempt[\s\S]*for update/,
    );
    expect(functionBody).toContain("github_evaluation_conflict");
    expect(functionBody).toContain("return existing_evaluation");
    expect(functionBody).toContain("existing_evaluation.workflow_ref");
    expect(functionBody).toContain("existing_evaluation.commit_sha");
    expect(functionBody).toContain("existing_evaluation.decision");
    expect(functionBody).toContain("existing_evaluation.receipt_id");
    expect(functionBody).toContain("existing_evaluation.evaluated_at");
    expect(functionBody).toMatch(
      /insert\s+into\s+public\.repository_evaluations[\s\S]*returning\s+\*/,
    );
    expect(functionBody).toMatch(/update\s+public\.github_repositories/);
    expect(functionBody).toContain("latest_decision");
    expect(functionBody).toContain("latest_evaluation_at");
    expect(functionBody).toContain("lifecycle_state in ('configured', 'needs_attention')");
    expect(functionBody).toContain("else lifecycle_state");
    expect(functionBody).toContain("'verified'");
    expect(functionBody).not.toMatch(/update\s+public\.repository_evaluations/);
    expect(functionBody.indexOf("github_evaluation_conflict")).toBeLessThan(
      functionBody.indexOf("update public.github_repositories"),
    );

    expect(normalized).toMatch(
      /revoke execute on function public\.record_github_evaluation_and_verify\s*\(bigint, bigint, integer, text, text, text, text, timestamptz\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    expect(normalized).toMatch(
      /grant execute on function public\.record_github_evaluation_and_verify\s*\(bigint, bigint, integer, text, text, text, text, timestamptz\)\s+to\s+service_role/i,
    );
    expect(normalized).not.toMatch(
      /(oidc|private_key|installation_token|telegraph_private_key|access_token|refresh_token|oauth_token)/i,
    );
  });
});
