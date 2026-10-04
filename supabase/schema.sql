-- Run once in your Supabase project's SQL Editor.
begin;
create table if not exists public.travel_ledgers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trips jsonb not null default '[]'::jsonb check (jsonb_typeof(trips) = 'array'),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.travel_ledgers enable row level security;
revoke all on public.travel_ledgers from anon, authenticated;
grant select on public.travel_ledgers to authenticated;
drop policy if exists ledger_owner_read on public.travel_ledgers;
create policy ledger_owner_read on public.travel_ledgers for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.ledger_read() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object('trips', trips, 'revision', revision) into result
    from public.travel_ledgers where user_id = auth.uid();
  return coalesce(result, '{"trips":[],"revision":0}'::jsonb);
end;
$$;

create or replace function public.ledger_write(expected_revision bigint, new_trips jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_row public.travel_ledgers; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_trips is null or jsonb_typeof(new_trips) <> 'array' then raise exception 'Invalid trips'; end if;
  -- Serializes first insert as well as subsequent writes for the authenticated owner.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  insert into public.travel_ledgers(user_id) values (auth.uid()) on conflict do nothing;
  select * into current_row from public.travel_ledgers where user_id = auth.uid() for update;
  if current_row.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'revision', current_row.revision);
  end if;
  if current_row.trips is distinct from new_trips then
    update public.travel_ledgers set trips = new_trips, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() returning * into current_row;
  end if;
  return jsonb_build_object('ok', true, 'trips', current_row.trips, 'revision', current_row.revision);
end;
$$;
revoke all on function public.ledger_read() from public, anon;
revoke all on function public.ledger_write(bigint, jsonb) from public, anon;
grant execute on function public.ledger_read() to authenticated;
grant execute on function public.ledger_write(bigint, jsonb) to authenticated;
commit;
