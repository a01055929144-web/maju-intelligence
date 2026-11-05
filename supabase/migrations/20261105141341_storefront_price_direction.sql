-- 운영 적용 완료(2026-11-05), 재실행 금지. 운영 fcmdvveqmcgtioelzqun에 컨트롤타워가 1회 적용한 기록.
-- Supabase migration version: 20261105141341 (storefront_price_direction_20261105).
-- 아래는 승인된 SQL 초안 원문이다. 기능 env와 회사 공개 동의는 OFF 유지.
-- REVIEW ONLY. Separate operating DB approval required. No price/history mutation.
begin;
set local lock_timeout = '5s';
alter table public.store_order_settings add column if not exists show_storefront_price_direction boolean not null default false;
create or replace function public.set_storefront_price_direction_visibility(p_company uuid, p_enabled boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_company is null or p_enabled is null then raise exception 'invalid_visibility'; end if;
  insert into public.store_order_settings(company_id,show_storefront_price_direction) values(p_company,p_enabled)
  on conflict(company_id) do update set show_storefront_price_direction=excluded.show_storefront_price_direction,updated_at=now();
  return p_enabled;
end $$;
revoke all on function public.set_storefront_price_direction_visibility(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_storefront_price_direction_visibility(uuid,boolean) to service_role;
commit;
