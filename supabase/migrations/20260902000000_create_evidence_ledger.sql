create extension if not exists pgcrypto;

create table if not exists public.runs (
  id text primary key,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  repository text not null,
  pull_request_number integer not null check (pull_request_number > 0),
  base_sha text not null check (base_sha ~ '^[0-9a-fA-F]{40}$'),
  head_sha text not null check (head_sha ~ '^[0-9a-fA-F]{40}$'),
  github_run_id bigint not null check (github_run_id > 0),
  github_run_attempt integer not null check (github_run_attempt > 0),
  github_event text not null check (github_event in ('pull_request', 'pull_request_target')),
  actor text not null,
  policy_version text not null,
  overall_decision text not null check (overall_decision in ('PASS', 'HOLD', 'REVIEW')),
  run_reason_code text not null,
  run_summary text not null,
  decision_count integer not null check (decision_count >= 0),
  pass_count integer not null check (pass_count >= 0),
  hold_count integer not null check (hold_count >= 0),
  review_count integer not null check (review_count >= 0),
  telegraph_request_count integer not null check (telegraph_request_count >= 0),
  telegraph_cost_usd numeric(18, 6) not null check (telegraph_cost_usd >= 0),
  evaluated_cves jsonb not null check (jsonb_typeof(evaluated_cves) = 'array'),
  skipped_cves jsonb not null check (jsonb_typeof(skipped_cves) = 'array'),
  is_test boolean not null,
  usage_class text not null check (usage_class in ('production', 'demo', 'development', 'test')),
  check (is_test = (usage_class <> 'production')),
  source text not null check (source in ('action', 'backfill')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  unique (github_run_id, github_run_attempt)
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.runs(id) on delete cascade,
  decision_id text not null,
  decision text not null check (decision in ('PASS', 'HOLD', 'REVIEW')),
  reason_code text not null,
  summary text not null,
  cve_id text not null,
  package_name text not null,
  ecosystem text not null,
  installed_version text,
  policy_version text not null,
  repository_evidence jsonb not null,
  telegraph_evidence jsonb,
  checks jsonb not null check (jsonb_typeof(checks) = 'array'),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (run_id, decision_id)
);

create table if not exists public.telegraph_requests (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.runs(id) on delete cascade,
  cve_id text not null,
  intent text not null check (intent = 'CVE_LOOKUP'),
  miner_id text,
  miner_name text,
  cost_usd numeric(18, 6) check (cost_usd is null or cost_usd >= 0),
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  network text,
  payment_scheme text,
  requested_at timestamptz not null,
  received_at timestamptz,
  outcome text not null check (outcome in ('success', 'failed')),
  settlement_reference text,
  created_at timestamptz not null default now(),
  unique (run_id, cve_id)
);

create index if not exists runs_repository_created_at_idx
  on public.runs (repository, created_at desc);
create index if not exists runs_overall_decision_idx
  on public.runs (overall_decision);
create index if not exists decisions_run_id_idx
  on public.decisions (run_id);
create index if not exists decisions_cve_id_idx
  on public.decisions (cve_id);
create index if not exists decisions_decision_idx
  on public.decisions (decision);
create index if not exists telegraph_requests_run_id_idx
  on public.telegraph_requests (run_id);
create index if not exists telegraph_requests_cve_id_idx
  on public.telegraph_requests (cve_id);
create index if not exists telegraph_requests_miner_name_idx
  on public.telegraph_requests (miner_name);

alter table public.runs enable row level security;
alter table public.decisions enable row level security;
alter table public.telegraph_requests enable row level security;

revoke all on table public.runs, public.decisions, public.telegraph_requests from anon, authenticated;
grant all on table public.runs, public.decisions, public.telegraph_requests to service_role;

create or replace function public.persist_limen_run(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_data jsonb := payload -> 'run';
  run_id text;
  requested_id text;
  existing_id text;
  existing_repository text;
  existing_head_sha text;
  existing_policy_version text;
  existing_decision text;
  existing_payload_hash text;
  inserted_id text;
  incoming_payload_hash text;
  decision_record jsonb;
  request_record jsonb;
begin
  requested_id := nullif(run_data ->> 'id', '');
  run_id := coalesce(
    requested_id,
    'LM-RUN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24))
  );
  incoming_payload_hash := md5(
    jsonb_set(payload, '{run}', (payload -> 'run') - 'id')::text
  );

  select id, repository, head_sha, policy_version, overall_decision, payload_hash
    into existing_id, existing_repository, existing_head_sha, existing_policy_version, existing_decision, existing_payload_hash
    from public.runs
   where github_run_id = (run_data ->> 'githubRunId')::bigint
     and github_run_attempt = (run_data ->> 'githubRunAttempt')::integer;

  if existing_id is not null then
     if existing_payload_hash <> incoming_payload_hash
      or requested_id is not null and requested_id <> existing_id
      or existing_repository <> run_data ->> 'repository'
      or existing_head_sha <> run_data ->> 'headSha'
      or existing_policy_version <> run_data ->> 'policyVersion'
      or existing_decision <> run_data ->> 'overallDecision' then
      raise exception 'Ledger idempotency key conflicts with an existing run.'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', existing_id, 'created', false);
  end if;

  insert into public.runs (
    id,
    payload_hash,
    repository,
    pull_request_number,
    base_sha,
    head_sha,
    github_run_id,
    github_run_attempt,
    github_event,
    actor,
    policy_version,
    overall_decision,
    run_reason_code,
    run_summary,
    decision_count,
    pass_count,
    hold_count,
    review_count,
    telegraph_request_count,
    telegraph_cost_usd,
    evaluated_cves,
    skipped_cves,
    is_test,
    usage_class,
    source,
    started_at,
    completed_at
  ) values (
    run_id,
     incoming_payload_hash,
    run_data ->> 'repository',
    (run_data ->> 'pullRequestNumber')::integer,
    run_data ->> 'baseSha',
    run_data ->> 'headSha',
    (run_data ->> 'githubRunId')::bigint,
    (run_data ->> 'githubRunAttempt')::integer,
    run_data ->> 'githubEvent',
    run_data ->> 'actor',
    run_data ->> 'policyVersion',
    run_data ->> 'overallDecision',
    run_data ->> 'runReasonCode',
    run_data ->> 'runSummary',
    (run_data ->> 'decisionCount')::integer,
    (run_data ->> 'passCount')::integer,
    (run_data ->> 'holdCount')::integer,
    (run_data ->> 'reviewCount')::integer,
    (run_data ->> 'telegraphRequestCount')::integer,
    (run_data ->> 'telegraphCostUsd')::numeric,
    run_data -> 'evaluatedCves',
    run_data -> 'skippedCves',
    (run_data ->> 'isTest')::boolean,
    run_data ->> 'usageClass',
    run_data ->> 'source',
    (run_data ->> 'startedAt')::timestamptz,
    (run_data ->> 'completedAt')::timestamptz
  )
  on conflict (github_run_id, github_run_attempt) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    select id, repository, head_sha, policy_version, overall_decision, payload_hash
      into existing_id, existing_repository, existing_head_sha, existing_policy_version, existing_decision, existing_payload_hash
      from public.runs
     where github_run_id = (run_data ->> 'githubRunId')::bigint
       and github_run_attempt = (run_data ->> 'githubRunAttempt')::integer;

    if existing_id is null then
      raise exception 'Ledger idempotency check could not resolve the existing run.'
        using errcode = 'P0001';
    end if;
     if existing_payload_hash <> incoming_payload_hash
      or requested_id is not null and requested_id <> existing_id
      or existing_repository <> run_data ->> 'repository'
      or existing_head_sha <> run_data ->> 'headSha'
      or existing_policy_version <> run_data ->> 'policyVersion'
      or existing_decision <> run_data ->> 'overallDecision' then
      raise exception 'Ledger idempotency key conflicts with an existing run.'
        using errcode = 'P0001';
    end if;
    return jsonb_build_object('id', existing_id, 'created', false);
  end if;

  for decision_record in select value from jsonb_array_elements(payload -> 'decisions') loop
    insert into public.decisions (
      run_id,
      decision_id,
      decision,
      reason_code,
      summary,
      cve_id,
      package_name,
      ecosystem,
      installed_version,
      policy_version,
      repository_evidence,
      telegraph_evidence,
      checks,
      evaluated_at
    ) values (
      run_id,
      decision_record ->> 'id',
      decision_record ->> 'decision',
      decision_record ->> 'reasonCode',
      decision_record ->> 'summary',
      decision_record ->> 'cveId',
      decision_record -> 'repositoryEvidence' ->> 'packageName',
      decision_record -> 'repositoryEvidence' ->> 'ecosystem',
      decision_record -> 'repositoryEvidence' ->> 'installedVersion',
      decision_record ->> 'policyVersion',
      decision_record -> 'repositoryEvidence',
      case
        when decision_record -> 'telegraphEvidence' = 'null'::jsonb then null
        else jsonb_set(decision_record -> 'telegraphEvidence', '{raw}', 'null'::jsonb, true)
      end,
      decision_record -> 'checks',
      (decision_record ->> 'evaluatedAt')::timestamptz
    );
  end loop;

  for request_record in select value from jsonb_array_elements(payload -> 'telegraphRequests') loop
    insert into public.telegraph_requests (
      run_id,
      cve_id,
      intent,
      miner_id,
      miner_name,
      cost_usd,
      duration_ms,
      network,
      payment_scheme,
      requested_at,
      received_at,
      outcome,
      settlement_reference
    ) values (
      run_id,
      request_record ->> 'cveId',
      request_record ->> 'intent',
      request_record ->> 'minerId',
      request_record ->> 'minerName',
      (request_record ->> 'costUsd')::numeric,
      (request_record ->> 'durationMs')::bigint,
      request_record ->> 'network',
      request_record ->> 'paymentScheme',
      (request_record ->> 'requestedAt')::timestamptz,
      nullif(request_record ->> 'receivedAt', '')::timestamptz,
      request_record ->> 'outcome',
      nullif(request_record ->> 'settlementReference', '')
    );
  end loop;

  return jsonb_build_object('id', run_id, 'created', true);
end;
$$;

revoke execute on function public.persist_limen_run(jsonb) from public;
grant execute on function public.persist_limen_run(jsonb) to service_role;
