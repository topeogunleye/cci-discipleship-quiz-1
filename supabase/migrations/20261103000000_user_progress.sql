create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;
revoke all on table public.user_progress from anon, authenticated;

create or replace function public.get_user_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  stored public.user_progress%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into stored from public.user_progress where user_id = current_user_id;
  if not found then return jsonb_build_object('version', 0, 'data', null); end if;
  return jsonb_build_object('version', stored.version, 'data', stored.data);
end;
$$;

create or replace function public.sync_user_progress(p_expected_version bigint, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  stored public.user_progress%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'Invalid progress version' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_data ->> 'schemaVersion' <> '2' then
    raise exception 'Invalid progress document' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 5242880 then
    raise exception 'Progress document is too large' using errcode = '22023';
  end if;

  if p_expected_version = 0 then
    insert into public.user_progress (user_id, version, data, updated_at)
    values (current_user_id, 1, p_data, now())
    on conflict (user_id) do nothing
    returning * into stored;
    if found then
      return jsonb_build_object('ok', true, 'version', stored.version, 'data', stored.data);
    end if;
  else
    update public.user_progress
       set version = version + 1, data = p_data, updated_at = now()
     where user_id = current_user_id and version = p_expected_version
     returning * into stored;
    if found then
      return jsonb_build_object('ok', true, 'version', stored.version, 'data', stored.data);
    end if;
  end if;

  select * into stored from public.user_progress where user_id = current_user_id;
  if not found then return jsonb_build_object('ok', false, 'version', 0, 'data', null); end if;
  return jsonb_build_object('ok', false, 'version', stored.version, 'data', stored.data);
end;
$$;

revoke all on function public.get_user_progress() from public, anon;
revoke all on function public.sync_user_progress(bigint, jsonb) from public, anon;
grant execute on function public.get_user_progress() to authenticated;
grant execute on function public.sync_user_progress(bigint, jsonb) to authenticated;
