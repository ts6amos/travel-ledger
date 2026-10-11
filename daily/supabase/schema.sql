-- Run once in your Supabase project's SQL Editor.
begin;
create table if not exists public.daily_ledgers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  books jsonb not null default '[]'::jsonb check (jsonb_typeof(books) = 'array'),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.daily_ledgers enable row level security;
revoke all on public.daily_ledgers from anon, authenticated;
grant select on public.daily_ledgers to authenticated;
drop policy if exists daily_ledger_owner_read on public.daily_ledgers;
create policy daily_ledger_owner_read on public.daily_ledgers for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.daily_ledger_read() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object('books', books, 'revision', revision) into result
    from public.daily_ledgers where user_id = auth.uid();
  return coalesce(result, '{"books":[],"revision":0}'::jsonb);
end;
$$;

create or replace function public.daily_ledger_write(expected_revision bigint, new_books jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_row public.daily_ledgers; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if new_books is null or jsonb_typeof(new_books) <> 'array' then raise exception 'Invalid books'; end if;
  if pg_catalog.pg_column_size(new_books) > 15000000 then raise exception 'Ledger exceeds 15 MB'; end if;
  -- Serializes first insert as well as subsequent writes for the authenticated owner.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  insert into public.daily_ledgers(user_id) values (auth.uid()) on conflict do nothing;
  select * into current_row from public.daily_ledgers where user_id = auth.uid() for update;
  if current_row.revision <> expected_revision then
    return jsonb_build_object('ok', false, 'revision', current_row.revision);
  end if;
  if current_row.books is distinct from new_books then
    update public.daily_ledgers set books = new_books, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() returning * into current_row;
  end if;
  return jsonb_build_object('ok', true, 'books', current_row.books, 'revision', current_row.revision);
end;
$$;
revoke all on function public.daily_ledger_read() from public, anon;
revoke all on function public.daily_ledger_write(bigint, jsonb) from public, anon;
grant execute on function public.daily_ledger_read() to authenticated;
grant execute on function public.daily_ledger_write(bigint, jsonb) to authenticated;
commit;
