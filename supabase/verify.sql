-- Optional verification in Supabase SQL Editor AFTER schema.sql.
-- Rolls back all test accounts/data. Run the entire file as one execution.
begin;
insert into auth.users(id, email) values
 ('afbf0bf0-4591-4d1d-8f4d-684a64cc2701', 'ledger-test-a@example.invalid'),
 ('afbf0bf0-4591-4d1d-8f4d-684a64cc2702', 'ledger-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'afbf0bf0-4591-4d1d-8f4d-684a64cc2701', true);
do $$
declare result jsonb;
begin
  result := public.ledger_read();
  if result->'trips' <> '[]'::jsonb then raise exception 'New account must be empty'; end if;
  result := public.ledger_write(0, '[{"id":"test-trip","expenses":[]}]'::jsonb);
  if result->>'ok' <> 'true' then raise exception 'First write failed'; end if;
  result := public.ledger_write(0, '[]'::jsonb);
  if result->>'ok' <> 'false' then raise exception 'Stale revision accepted'; end if;
  if (select count(*) from public.travel_ledgers) <> 1 then raise exception 'Owner read denied'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'afbf0bf0-4591-4d1d-8f4d-684a64cc2702', true);
do $$
begin
  if (public.ledger_read())->'trips' <> '[]'::jsonb then raise exception 'Other account data leaked'; end if;
  if (select count(*) from public.travel_ledgers) <> 0 then raise exception 'RLS isolation failed'; end if;
end $$;
set local role anon;
do $$
begin
  begin
    perform public.ledger_read();
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ledger_write(0, '[]'::jsonb);
    raise exception 'Anonymous write allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
