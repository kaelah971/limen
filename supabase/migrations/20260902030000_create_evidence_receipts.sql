create table if not exists public.receipts (
  id text primary key check (id ~ '^LM-REC-[A-Z0-9][A-Z0-9-]{2,127}$'),
  run_id text not null unique references public.runs(id) on delete cascade,
  schema_version text not null check (schema_version = 'limen.receipt.v1'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= published_at)
);

create index if not exists receipts_published_at_idx
  on public.receipts (published_at desc);
create index if not exists receipts_run_id_idx
  on public.receipts (run_id);

alter table public.receipts enable row level security;

revoke all on table public.receipts from anon, authenticated;
grant all on table public.receipts to service_role;

create or replace function public.publish_limen_receipt(
  input_run_id text,
  input_schema_version text,
  input_snapshot jsonb,
  input_snapshot_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id text;
  existing_schema_version text;
  existing_snapshot jsonb;
  existing_snapshot_hash text;
  existing_published_at timestamptz;
  existing_revoked_at timestamptz;
  inserted_id text;
  inserted_published_at timestamptz;
begin
  if not exists (select 1 from public.runs where id = input_run_id) then
    raise exception 'Receipt publication requires an existing ledger run.'
      using errcode = 'P0004';
  end if;

  select id, schema_version, snapshot, snapshot_hash, published_at, revoked_at
    into existing_id, existing_schema_version, existing_snapshot, existing_snapshot_hash,
      existing_published_at, existing_revoked_at
    from public.receipts
   where run_id = input_run_id;

  if existing_id is not null then
    if existing_revoked_at is not null then
      raise exception 'Receipt is revoked and cannot be republished.'
        using errcode = 'P0003';
    end if;
    if existing_schema_version <> input_schema_version
      or existing_snapshot_hash <> input_snapshot_hash
      or existing_snapshot <> input_snapshot then
      raise exception 'Receipt publication conflicts with an existing snapshot.'
        using errcode = 'P0002';
    end if;
    return jsonb_build_object(
      'id', existing_id,
      'runId', input_run_id,
      'schemaVersion', existing_schema_version,
      'snapshotHash', existing_snapshot_hash,
      'publishedAt', existing_published_at,
      'revokedAt', existing_revoked_at,
      'created', false
    );
  end if;

  insert into public.receipts (
    id,
    run_id,
    schema_version,
    snapshot,
    snapshot_hash
  ) values (
    'LM-REC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)),
    input_run_id,
    input_schema_version,
    input_snapshot,
    input_snapshot_hash
  )
  on conflict (run_id) do nothing
  returning id, published_at into inserted_id, inserted_published_at;

  if inserted_id is null then
    select id, schema_version, snapshot, snapshot_hash, published_at, revoked_at
      into existing_id, existing_schema_version, existing_snapshot, existing_snapshot_hash,
        existing_published_at, existing_revoked_at
      from public.receipts
     where run_id = input_run_id;

    if existing_id is null then
      raise exception 'Receipt publication could not resolve the existing receipt.'
        using errcode = 'P0002';
    end if;
    if existing_revoked_at is not null then
      raise exception 'Receipt is revoked and cannot be republished.'
        using errcode = 'P0003';
    end if;
    if existing_schema_version <> input_schema_version
      or existing_snapshot_hash <> input_snapshot_hash
      or existing_snapshot <> input_snapshot then
      raise exception 'Receipt publication conflicts with an existing snapshot.'
        using errcode = 'P0002';
    end if;
    return jsonb_build_object(
      'id', existing_id,
      'runId', input_run_id,
      'schemaVersion', existing_schema_version,
      'snapshotHash', existing_snapshot_hash,
      'publishedAt', existing_published_at,
      'revokedAt', existing_revoked_at,
      'created', false
    );
  end if;

  return jsonb_build_object(
    'id', inserted_id,
    'runId', input_run_id,
    'schemaVersion', input_schema_version,
    'snapshotHash', input_snapshot_hash,
    'publishedAt', inserted_published_at,
    'revokedAt', null,
    'created', true
  );
end;
$$;

create or replace function public.revoke_limen_receipt(input_receipt_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  receipt_row public.receipts%rowtype;
  next_revoked_at timestamptz;
begin
  select * into receipt_row
    from public.receipts
   where id = input_receipt_id
   for update;

  if receipt_row.id is null then
    raise exception 'Receipt was not found.'
      using errcode = 'P0004';
  end if;

  if receipt_row.revoked_at is not null then
    return jsonb_build_object(
      'id', receipt_row.id,
      'runId', receipt_row.run_id,
      'schemaVersion', receipt_row.schema_version,
      'snapshotHash', receipt_row.snapshot_hash,
      'publishedAt', receipt_row.published_at,
      'revokedAt', receipt_row.revoked_at,
      'created', false
    );
  end if;

  next_revoked_at := now();
  update public.receipts
     set revoked_at = next_revoked_at
   where id = input_receipt_id;

  return jsonb_build_object(
    'id', receipt_row.id,
    'runId', receipt_row.run_id,
    'schemaVersion', receipt_row.schema_version,
    'snapshotHash', receipt_row.snapshot_hash,
    'publishedAt', receipt_row.published_at,
    'revokedAt', next_revoked_at,
    'created', true
  );
end;
$$;

revoke execute on function public.publish_limen_receipt(text, text, jsonb, text) from public;
revoke execute on function public.revoke_limen_receipt(text) from public;
grant execute on function public.publish_limen_receipt(text, text, jsonb, text) to service_role;
grant execute on function public.revoke_limen_receipt(text) to service_role;
