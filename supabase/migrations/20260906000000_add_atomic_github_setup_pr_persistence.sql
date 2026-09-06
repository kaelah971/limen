alter table public.github_setup_prs
  add column pr_url text;

update public.github_setup_prs setup_pr
set pr_url = 'https://github.com/' || repository.full_name || '/pull/' || setup_pr.pr_number
from public.github_repositories repository
where setup_pr.repository_id = repository.repository_id
  and setup_pr.pr_url is null;

alter table public.github_setup_prs
  alter column pr_url set not null;

alter table public.github_setup_prs
  add constraint github_setup_prs_pr_url_valid
  check (length(btrim(pr_url)) between 1 and 2048);

create unique index if not exists github_setup_prs_one_open_per_repository_idx
  on public.github_setup_prs (repository_id)
  where state = 'OPEN';

create or replace function public.record_github_setup_pr_and_transition(
  p_repository_id bigint,
  p_pr_number bigint,
  p_pr_url text,
  p_branch_name text
)
returns public.github_setup_prs
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_repository public.github_repositories%rowtype;
  existing_setup_pr public.github_setup_prs%rowtype;
  recorded_setup_pr public.github_setup_prs%rowtype;
  normalized_pr_url text;
  normalized_branch_name text;
begin
  normalized_pr_url := btrim(p_pr_url);
  normalized_branch_name := btrim(p_branch_name);

  if p_repository_id is null or p_repository_id <= 0
    or p_pr_number is null or p_pr_number <= 0 or p_pr_number > 2147483647
    or normalized_pr_url is null or length(normalized_pr_url) = 0
    or length(normalized_pr_url) > 2048
    or normalized_branch_name is null or length(normalized_branch_name) = 0
    or length(normalized_branch_name) > 255 then
    raise exception using
      errcode = '22023',
      message = 'GITHUB_SETUP_INPUT_INVALID';
  end if;

  select *
  into target_repository
  from public.github_repositories
  where repository_id = p_repository_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'GITHUB_REPOSITORY_NOT_FOUND';
  end if;

  if target_repository.lifecycle_state = 'DISCONNECTED' then
    raise exception using
      errcode = 'P0003',
      message = 'GITHUB_REPOSITORY_DISCONNECTED';
  end if;

  select *
  into existing_setup_pr
  from public.github_setup_prs
  where repository_id = p_repository_id
    and state = 'OPEN'
  for update;

  if found then
    if existing_setup_pr.pr_number = p_pr_number::integer
      and existing_setup_pr.pr_url = normalized_pr_url
      and existing_setup_pr.branch_name = normalized_branch_name then
      update public.github_repositories
      set lifecycle_state = 'SETUP_PR_OPEN',
          updated_at = now()
      where repository_id = p_repository_id;
      return existing_setup_pr;
    end if;

    raise exception using
      errcode = 'P0004',
      message = 'GITHUB_SETUP_PR_ALREADY_OPEN';
  end if;

  begin
    insert into public.github_setup_prs (
      repository_id,
      pr_number,
      pr_url,
      branch_name,
      state
    ) values (
      p_repository_id,
      p_pr_number::integer,
      normalized_pr_url,
      normalized_branch_name,
      'OPEN'
    )
    returning * into recorded_setup_pr;
  exception
    when unique_violation then
      raise exception using
        errcode = 'P0004',
        message = 'GITHUB_SETUP_PR_ALREADY_OPEN';
  end;

  update public.github_repositories
  set lifecycle_state = 'SETUP_PR_OPEN',
      updated_at = now()
  where repository_id = p_repository_id;

  return recorded_setup_pr;
end;
$function$;

revoke execute on function public.record_github_setup_pr_and_transition(bigint, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.record_github_setup_pr_and_transition(bigint, bigint, text, text)
  to service_role;
