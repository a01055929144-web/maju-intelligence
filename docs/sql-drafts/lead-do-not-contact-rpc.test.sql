-- 로컬 PG16 검증용(운영 실행 금지). 순서: 최소 스키마 → company_do_not_contact(마이그레이션 20261026223510) → lead-do-not-contact-rpc.sql → 이 파일
-- 2026-10-29 결과: 10xxxxxxxx 정규화 일치, 재등록 시 기록 중복 없음, @아이디↔주소 일치, 비활성 회사 거부, 다른 채널 거부가 남은 리드는 해제 후에도 제외 유지
-- schema: do $$ begin
-- schema:   if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
-- schema:   if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
-- schema:   if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
-- schema: end $$;
-- schema: create extension if not exists pgcrypto;
-- schema: create table companies(id uuid primary key, status text);
-- schema: create table app_users(id uuid primary key, status text);
-- schema: create table company_members(company_id uuid, user_id uuid, status text, role text, permission_role text);
-- schema: create table business_permit_leads(id uuid default gen_random_uuid(), company_id uuid, status text, exclude_reason text, next_action text, updated_at timestamptz,
-- schema:   merged_into_lead_id uuid, phone text, fax text, email text, instagram_url text, naver_talktalk_url text, primary key(id), unique(company_id,id));
-- schema: create table lead_actions(id uuid default gen_random_uuid() primary key, company_id uuid, lead_id uuid, action_type text, result text, memo text, actor_name text, metadata jsonb, created_at timestamptz default clock_timestamp());
\set ON_ERROR_STOP 1
insert into companies values ('00000000-0000-0000-0000-00000000000c','active'), ('00000000-0000-0000-0000-0000000000dd','closed');
insert into app_users values ('00000000-0000-0000-0000-0000000000a1','active');
insert into company_members values ('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-0000000000a1','active','owner','owner');
insert into business_permit_leads(id,company_id,status,phone,instagram_url) values
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','신규','010-1234-5678','https://www.instagram.com/Cafe.ABC/?igsh=xyz'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c','연락함','1012345678',null),
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000c','거래처 전환','01012345678','@cafe.abc');
select 'norm', normalize_dnc_value('sms','10-1234-5678'), normalize_dnc_value('instagram','https://www.instagram.com/Cafe.ABC/?igsh=xyz'), normalize_dnc_value('instagram','@cafe.abc'), mask_dnc_value('sms','12345'), mask_dnc_value('sms','01012345678');
-- 1) register sms: all 3 leads match (2 with 10-prefix), lead3 keeps status
select register_lead_do_not_contact('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000001','sms','01012345678','싫다함','00000000-0000-0000-0000-0000000000a1','대표');
select id, status, exclude_reason from business_permit_leads order by id;
select count(*) as actions_after_first from lead_actions;
-- 2) re-register same value → no new actions
select register_lead_do_not_contact('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000002','sms','010 1234 5678','재등록',null,'직원');
select count(*) as actions_after_repeat from lead_actions;
-- 3) instagram with URL tail vs @handle
select register_lead_do_not_contact('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000003','instagram','@Cafe.ABC','DM 거부',null,'직원');
select metadata->>'channel' ch, metadata->>'masked_value' m, lead_id from lead_actions where metadata->>'channel'='instagram' order by lead_id;
-- 4) closed company rejected
do $$ begin perform register_lead_do_not_contact('00000000-0000-0000-0000-0000000000dd','00000000-0000-0000-0000-000000000001','sms','01012345678','x',null,'x'); raise exception 'should fail'; exception when others then if sqlerrm <> 'active_company_required' then raise; end if; end $$;
-- 5) release sms dnc: leads 1,2 restore (instagram dnc still active blocks lead1? lead1 matched instagram too)
select release_lead_do_not_contact('00000000-0000-0000-0000-00000000000c',(select id from company_do_not_contact where channel='sms'),'해제 요청','app_user','00000000-0000-0000-0000-0000000000a1','대표');
select id, status, exclude_reason from business_permit_leads order by id;
select channel, released_at is not null as released from company_do_not_contact order by channel;
