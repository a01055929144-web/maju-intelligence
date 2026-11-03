-- 11/3 데이터 정리 (대표 결정). 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요.
-- 원칙: 리드(business_permit_leads 등)는 한 건도 지우지 않는다. 삭제 전 backup_20261103 스키마에 전부 복사.
-- 운영 회사 04ebb7bb-8da0-4723-8211-f2a947939344 / 테스트 고객사 898d85fc-c475-47e0-9943-91709e13a4bb
begin;
create schema if not exists backup_20261103;
revoke all on schema backup_20261103 from public, anon, authenticated;

-- 사전 리드 건수 기록
create table backup_20261103.lead_counts_before as
  select company_id, count(*) as n from public.business_permit_leads
   where company_id in ('04ebb7bb-8da0-4723-8211-f2a947939344','898d85fc-c475-47e0-9943-91709e13a4bb') group by company_id;

-- A. 운영 회사: 거래처(+딸린 메모·첨부·연락처·발송기록·거리캐시 등 cascade 대상)
do $$
declare t text;
begin
  foreach t in array array['normalized_customers','customer_notes','customer_attachments','customer_contacts','customer_message_logs',
    'route_distance_cache','delivery_route_follow_ups','delivery_notification_jobs','customer_price_agreements','delivery_events',
    'store_order_customer_rules','storefront_links','store_product_preferences','delivery_vehicles','route_plan_confirmations',
    'staff_invitations','driver_message_templates','company_members'] loop
    execute format('create table backup_20261103.%I as select * from public.%I where company_id = %L', 'ops_'||t, t, '04ebb7bb-8da0-4723-8211-f2a947939344');
  end loop;
end $$;
create table backup_20261103.ops_lead_customer_links as
  select id, matched_customer_id from public.business_permit_leads
   where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344' and matched_customer_id is not null;
create table backup_20261103.ops_driver_location_events as
  select * from public.staff_location_events
   where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344'
     and user_id in (select user_id from public.company_members where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344' and role = 'driver');

-- 거래처 삭제 (리드의 matched_customer_id 는 FK on delete set null → 리드 행은 그대로)
delete from public.normalized_customers where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344';
-- 배송차·코스 확정 기록
delete from public.route_plan_confirmations where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344';
delete from public.delivery_vehicles where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344';
-- 담당자(배송기사 2명): 소속·초대·기사 문구·위치기록. 대표 계정과 대표 카카오 연결은 유지.
delete from public.staff_location_events
 where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344'
   and user_id in (select user_id from public.company_members where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344' and role = 'driver');
delete from public.driver_message_templates where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344';
delete from public.staff_invitations where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344';
delete from public.company_members where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344' and role = 'driver';

-- B. 테스트 고객사: 계정·로그인 정보 삭제, 회사는 closed 처리(회사 행을 지우면 리드 4,867건이 cascade 삭제되므로 보존)
create table backup_20261103.test_company as select * from public.companies where id = '898d85fc-c475-47e0-9943-91709e13a4bb';
create table backup_20261103.test_company_members as select * from public.company_members where company_id = '898d85fc-c475-47e0-9943-91709e13a4bb';
create table backup_20261103.test_auth_credentials as select * from public.auth_credentials where customer_company_id = '898d85fc-c475-47e0-9943-91709e13a4bb';
create table backup_20261103.test_app_user as select * from public.app_users where id = 'e3d5c5b1-2426-4012-92b4-3490f86830ad';
update public.companies set status = 'closed', closed_at = now(), closed_by = 'Claude(대표 지시 11/3)', owner_user_id = null, updated_at = now()
 where id = '898d85fc-c475-47e0-9943-91709e13a4bb';
delete from public.auth_credentials where customer_company_id = '898d85fc-c475-47e0-9943-91709e13a4bb';
delete from public.company_members where company_id = '898d85fc-c475-47e0-9943-91709e13a4bb';
delete from public.app_users where id = 'e3d5c5b1-2426-4012-92b4-3490f86830ad';

-- 검증: 리드 건수 전후 동일해야 함. 다르면 예외로 전체 롤백.
do $$
declare bad int;
begin
  select count(*) into bad from backup_20261103.lead_counts_before b
   where b.n <> (select count(*) from public.business_permit_leads l where l.company_id = b.company_id);
  if bad > 0 then raise exception 'lead count changed — rollback'; end if;
end $$;
commit;
