-- DRAFT ONLY. CX-141 C: 매장 활동 기록(로그인한 매장의 홈·문서·전체 상품·검색·장바구니·주문). 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 검색어 원문·가격·원가는 저장하지 않는다(종류와 참조 id만). 같은 매장·종류·참조가 5분 안에 반복되면 기록하지 않는다.
-- 홈 열기(home) 기록이 곧 "마지막 접속"이다. 쓰기는 service_role의 함수 호출만.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.store_activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null,
  kind text not null check (kind in ('home','document','catalog','search','cart','order')),
  ref_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (company_id, store_account_id) references public.store_accounts(company_id, id) on delete cascade
);
create index store_activity_events_account_idx on public.store_activity_events(company_id, store_account_id, occurred_at desc);
create index store_activity_events_company_idx on public.store_activity_events(company_id, occurred_at desc);
alter table public.store_activity_events enable row level security;
revoke all on public.store_activity_events from public, anon, authenticated, service_role;
grant select, insert on public.store_activity_events to service_role;

create function public.record_store_activity_v1(p_company uuid, p_account uuid, p_kind text, p_ref uuid default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_company is null or p_account is null or p_kind is null or p_kind not in ('home','document','catalog','search','cart','order')
    then raise exception 'store_activity_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store_activity:' || p_company::text || ':' || p_account::text || ':' || p_kind || ':' || coalesce(p_ref::text, ''), 0));
  if exists (select 1 from public.store_activity_events e
      where e.company_id = p_company and e.store_account_id = p_account and e.kind = p_kind
        and e.ref_id is not distinct from p_ref and e.occurred_at > clock_timestamp() - interval '5 minutes')
    then return false; end if;
  insert into public.store_activity_events(company_id, store_account_id, kind, ref_id) values (p_company, p_account, p_kind, p_ref);
  return true;
end $$;
revoke all on function public.record_store_activity_v1(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_store_activity_v1(uuid, uuid, text, uuid) to service_role;

commit;
