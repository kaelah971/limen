create table if not exists public.github_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null unique check (github_user_id > 0),
  github_login text not null check (length(github_login) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_installations (
  installation_id bigint primary key check (installation_id > 0),
  account_id bigint not null check (account_id > 0),
  account_login text not null,
  account_type text not null check (account_type in ('User', 'Organization')),
  installed_by_github_user_id bigint not null check (installed_by_github_user_id > 0),
  bound_by_auth_user_id uuid null references public.github_users(auth_user_id) on delete set null,
  connection_state text not null check (connection_state in ('ACTIVE', 'DISCONNECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_repositories (
  repository_id bigint primary key check (repository_id > 0),
  installation_id bigint not null references public.github_installations(installation_id),
  owner_login text not null,
  repository_name text not null,
  full_name text not null unique,
  default_branch text not null,
  lifecycle_state text not null check (lifecycle_state in ('SETUP_REQUIRED', 'SETUP_PR_OPEN', 'CONFIGURED', 'VERIFIED', 'NEEDS_ATTENTION', 'DISCONNECTED')),
  latest_decision text null check (latest_decision is null or latest_decision in ('PASS', 'HOLD', 'REVIEW')),
  latest_evaluation_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.github_setup_prs (
  id uuid primary key default gen_random_uuid(),
  repository_id bigint not null references public.github_repositories(repository_id) on delete cascade,
  pr_number integer not null check (pr_number > 0),
  branch_name text not null check (length(branch_name) > 0),
  state text not null check (state in ('OPEN', 'MERGED', 'CLOSED')),
  opened_at timestamptz not null default now(),
  merged_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (repository_id, pr_number)
);

create table if not exists public.github_webhook_deliveries (
  delivery_id text primary key check (length(delivery_id) between 1 and 255),
  event_name text not null,
  installation_id bigint null references public.github_installations(installation_id) on delete set null,
  sender_github_user_id bigint null check (sender_github_user_id is null or sender_github_user_id > 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.repository_evaluations (
  id uuid primary key default gen_random_uuid(),
  repository_id bigint not null references public.github_repositories(repository_id) on delete cascade,
  github_run_id bigint not null check (github_run_id > 0),
  run_attempt integer not null check (run_attempt > 0),
  workflow_ref text not null check (length(workflow_ref) > 0),
  commit_sha text not null check (commit_sha ~ '^[0-9a-fA-F]{40}$'),
  decision text not null check (decision in ('PASS', 'HOLD', 'REVIEW')),
  receipt_id text null references public.receipts(id) on delete set null,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (repository_id, github_run_id, run_attempt)
);

create unique index if not exists github_setup_prs_one_open_per_repository_idx
  on public.github_setup_prs (repository_id)
  where state = 'OPEN';

create index if not exists github_installations_account_id_idx
  on public.github_installations (account_id);
create index if not exists github_repositories_installation_id_idx
  on public.github_repositories (installation_id);
create index if not exists github_setup_prs_repository_id_idx
  on public.github_setup_prs (repository_id);
create index if not exists github_webhook_deliveries_installation_id_idx
  on public.github_webhook_deliveries (installation_id);
create index if not exists repository_evaluations_latest_idx
  on public.repository_evaluations (repository_id, evaluated_at desc);

alter table public.github_users enable row level security;
alter table public.github_installations enable row level security;
alter table public.github_repositories enable row level security;
alter table public.github_setup_prs enable row level security;
alter table public.github_webhook_deliveries enable row level security;
alter table public.repository_evaluations enable row level security;

revoke all on table public.github_users, public.github_installations, public.github_repositories, public.github_setup_prs, public.github_webhook_deliveries, public.repository_evaluations from anon, authenticated;
grant all on table public.github_users, public.github_installations, public.github_repositories, public.github_setup_prs, public.github_webhook_deliveries, public.repository_evaluations to service_role;
