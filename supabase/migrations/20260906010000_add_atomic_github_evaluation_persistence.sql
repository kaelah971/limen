create or replace function public.record_github_evaluation_and_verify(
  p_repository_id bigint,
  p_github_run_id bigint,
  p_run_attempt integer,
  p_workflow_ref text,
  p_commit_sha text,
  p_decision text,
  p_receipt_id text,
  p_evaluated_at timestamptz
)
returns public.repository_evaluations
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_repository public.github_repositories%rowtype;
  target_installation public.github_installations%rowtype;
  existing_evaluation public.repository_evaluations%rowtype;
  recorded_evaluation public.repository_evaluations%rowtype;
  normalized_workflow_ref text;
  normalized_commit_sha text;
  normalized_receipt_id text;
begin
  normalized_workflow_ref := btrim(p_workflow_ref);
  normalized_commit_sha := btrim(p_commit_sha);
  normalized_receipt_id := nullif(btrim(p_receipt_id), '');

  if p_repository_id is null or p_repository_id <= 0
    or p_github_run_id is null or p_github_run_id <= 0
    or p_run_attempt is null or p_run_attempt <= 0
    or normalized_workflow_ref is null or length(normalized_workflow_ref) = 0
    or normalized_commit_sha is null or length(normalized_commit_sha) = 0
    or normalized_commit_sha !~ '^[0-9a-fA-F]{40}$'
    or p_decision is null or p_decision not in ('PASS', 'HOLD', 'REVIEW')
    or p_evaluated_at is null then
    raise exception using
      errcode = '22023',
      message = 'GITHUB_EVALUATION_INPUT_INVALID';
  end if;

  select repository.*
  into target_repository
  from public.github_repositories repository
  where repository.repository_id = p_repository_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'GITHUB_REPOSITORY_NOT_FOUND';
  end if;

  select installation.*
  into target_installation
  from public.github_installations installation
  where installation.installation_id = target_repository.installation_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0003',
      message = 'GITHUB_INSTALLATION_NOT_FOUND';
  end if;

  if target_installation.connection_state = 'ACTIVE' then
    null;
  else
    raise exception using
      errcode = 'P0004',
      message = 'GITHUB_INSTALLATION_DISCONNECTED';
  end if;

  if target_repository.lifecycle_state = 'DISCONNECTED' then
    raise exception using
      errcode = 'P0005',
      message = 'GITHUB_REPOSITORY_DISCONNECTED';
  end if;

  select evaluation.*
  into existing_evaluation
  from public.repository_evaluations evaluation
  where evaluation.repository_id = p_repository_id
    and evaluation.github_run_id = p_github_run_id
    and evaluation.run_attempt = p_run_attempt
  for update;

  if found then
    if existing_evaluation.workflow_ref = normalized_workflow_ref
      and existing_evaluation.commit_sha = normalized_commit_sha
      and existing_evaluation.decision = p_decision
      and existing_evaluation.receipt_id is not distinct from normalized_receipt_id
      and existing_evaluation.evaluated_at = p_evaluated_at then
      return existing_evaluation;
    end if;

    raise exception using
      errcode = 'P0006',
      message = 'GITHUB_EVALUATION_CONFLICT';
  end if;

  begin
    insert into public.repository_evaluations (
      repository_id,
      github_run_id,
      run_attempt,
      workflow_ref,
      commit_sha,
      decision,
      receipt_id,
      evaluated_at
    ) values (
      p_repository_id,
      p_github_run_id,
      p_run_attempt,
      normalized_workflow_ref,
      normalized_commit_sha,
      p_decision,
      normalized_receipt_id,
      p_evaluated_at
    )
    returning * into recorded_evaluation;
  exception
    when unique_violation then
      select evaluation.*
      into existing_evaluation
      from public.repository_evaluations evaluation
      where evaluation.repository_id = p_repository_id
        and evaluation.github_run_id = p_github_run_id
        and evaluation.run_attempt = p_run_attempt
      for update;

      if found
        and existing_evaluation.workflow_ref = normalized_workflow_ref
        and existing_evaluation.commit_sha = normalized_commit_sha
        and existing_evaluation.decision = p_decision
        and existing_evaluation.receipt_id is not distinct from normalized_receipt_id
        and existing_evaluation.evaluated_at = p_evaluated_at then
        return existing_evaluation;
      end if;

      raise exception using
        errcode = 'P0006',
        message = 'GITHUB_EVALUATION_CONFLICT';
  end;

  update public.github_repositories
  set latest_decision = p_decision,
      latest_evaluation_at = p_evaluated_at,
      lifecycle_state = case
        when lifecycle_state in ('CONFIGURED', 'NEEDS_ATTENTION') then 'VERIFIED'
        else lifecycle_state
      end,
      updated_at = now()
  where repository_id = p_repository_id;

  return recorded_evaluation;
end;
$function$;

revoke execute on function public.record_github_evaluation_and_verify(bigint, bigint, integer, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_github_evaluation_and_verify(bigint, bigint, integer, text, text, text, text, timestamptz)
  to service_role;
