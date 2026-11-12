-- DOWN for CC-24b. Drops the excluded-codes table.
-- Refused while the list has any code (that setting would be lost); remove the codes from the screen first.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if to_regclass('public.purchase_cost_excluded_codes') is null then raise exception 'cc24b_not_applied'; end if;
  if exists(select 1 from public.purchase_cost_excluded_codes) then raise exception 'cc24b_down_refused_codes_exist'; end if;
end $$;
drop table public.purchase_cost_excluded_codes;
commit;
