-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto;
create table companies(id uuid primary key);
create table company_members(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table pricing_document_share_links(
 id uuid primary key, company_id uuid not null, document_id uuid not null, document_version_id uuid not null,
 revoked_at timestamptz, expires_at timestamptz not null, unique(company_id,id));
create table storefront_links(
 id uuid primary key, company_id uuid not null, customer_id uuid not null, document_version_id uuid not null,
 revoked_at timestamptz, expires_at timestamptz not null, first_viewed_at timestamptz,
 last_viewed_at timestamptz, view_count bigint not null default 0, unique(company_id,id));
create table storefront_link_events(
 id uuid primary key default gen_random_uuid(), company_id uuid not null, link_id uuid not null,
 event_type text not null constraint storefront_link_events_event_type_check
   check(event_type in ('view','cart','order','sent','reminder')),
 occurred_at timestamptz not null default now(), device_class text,
 foreign key(company_id,link_id) references storefront_links(company_id,id));
create table pricing_public_request_audit(
 company_id uuid,route_key text,requester_hash text,outcome text,occurred_at timestamptz default now());
create function pricing_s2_public_request_guard(uuid,text,text,jsonb,integer default 20)
returns text language sql as $$ select 'allowed'::text $$;

insert into companies values
 ('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2');
insert into company_members values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1');
insert into pricing_document_share_links values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000f1',null,now()+interval '1 day'),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000f2',null,now()-interval '1 day');
insert into storefront_links values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000f1',null,now()+interval '1 day',null,null,0);

\ir 2026-11-16-CX-44-short-share-links.sql

do $$ begin
 assert (select count(*) from pricing_document_share_links where short_code is not null)=0,'existing document links stay null';
 assert (select count(*) from storefront_links where short_code is not null)=0,'existing storefront links stay null';
end $$;

select assign_pricing_document_short_code_v1(
 '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','kakao','00000000-0000-0000-0000-0000000000a1');
select assign_pricing_document_short_code_v1(
 '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','kakao','00000000-0000-0000-0000-0000000000a1');
select assign_storefront_short_code_v1(
 '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','sms');

update pricing_document_share_links
set expires_at=now()+interval '1 day'
where id='00000000-0000-0000-0000-0000000000d2';
select assign_pricing_document_short_code_v1(
 '00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000d2','other',null);
update pricing_document_share_links
set expires_at=now()-interval '1 day'
where id='00000000-0000-0000-0000-0000000000d2';

do $$ declare dcode text; scode text; valid jsonb; foreign_company jsonb; expired jsonb; missing jsonb; begin
 select short_code into dcode from pricing_document_share_links where id='00000000-0000-0000-0000-0000000000d1';
 select short_code into scode from storefront_links where id='00000000-0000-0000-0000-0000000000b1';
 assert dcode ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$';
 assert scode ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$';
 begin
   update pricing_document_share_links set short_code='Ab3xK9pQ2z'
   where id='00000000-0000-0000-0000-0000000000d1';
   assert false,'assigned code must be immutable';
 exception when raise_exception then assert sqlerrm='short_link_code_immutable'; end;
 insert into pricing_document_share_links(id,company_id,document_id,document_version_id,expires_at,short_code,short_channel)
 values('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000f3',now()+interval '1 day',null,null);
 begin
   update pricing_document_share_links set short_code=dcode,short_channel='other'
   where id='00000000-0000-0000-0000-0000000000d3';
   assert false,'same table duplicate must fail';
 exception when unique_violation then null; end;
 valid:=resolve_pricing_document_short_link_v1(dcode,repeat('a',64),'mobile',false,null);
 foreign_company:=resolve_pricing_document_short_link_v1(dcode,repeat('b',64),'mobile',false,'00000000-0000-0000-0000-0000000000c2');
 expired:=resolve_pricing_document_short_link_v1(
   (select short_code from pricing_document_share_links where id='00000000-0000-0000-0000-0000000000d2'),
   repeat('c',64),'mobile',false,null);
 missing:=resolve_pricing_document_short_link_v1('Ab3xK9pQ2z',repeat('d',64),'mobile',false,null);
 assert valid->>'status'='available';
 assert foreign_company=expired and expired=missing and missing='{"status":"unavailable"}'::jsonb,
   'foreign, expired and missing responses must match';
 assert (select view_count from pricing_document_share_links where id='00000000-0000-0000-0000-0000000000d1')=1;
 perform resolve_pricing_document_short_link_v1(dcode,repeat('e',64),'unknown',true,null);
 assert (select view_count from pricing_document_share_links where id='00000000-0000-0000-0000-0000000000d1')=1,'preview bot excluded';
 assert (select count(*) from pricing_document_share_events where event_type='view')=1;
 perform resolve_storefront_short_link_v1(scode,repeat('f',64),'desktop',false,null);
 assert (select view_count from storefront_links where id='00000000-0000-0000-0000-0000000000b1')=1;
 assert (select count(*) from storefront_link_events where event_type='view')=1;
end $$;

select record_pricing_document_short_event_v1(
 '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','order_start','order-start-1');
select record_pricing_document_short_event_v1(
 '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','order_start','order-start-1');
do $$ begin
 assert (select count(*) from pricing_document_share_events where event_type='order_start')=1,'milestone idempotent';
end $$;

\set ON_ERROR_STOP off
\ir 2026-11-16-CX-44-short-share-links.down.sql
\set ON_ERROR_STOP on
do $$ begin assert to_regclass('public.pricing_document_share_events') is not null,'down must preserve evidence'; end $$;

delete from pricing_document_share_events;
delete from storefront_link_events where event_type in ('order_start','signup','first_order');
alter table pricing_document_share_links disable trigger pricing_document_share_short_code_guard;
alter table storefront_links disable trigger storefront_short_code_guard;
update pricing_document_share_links set short_code=null,short_channel=null,short_sent_by_user_id=null,
 first_viewed_at=null,last_viewed_at=null,view_count=0;
update storefront_links set short_code=null,short_channel=null,first_viewed_at=null,last_viewed_at=null,view_count=0;
alter table pricing_document_share_links enable trigger pricing_document_share_short_code_guard;
alter table storefront_links enable trigger storefront_short_code_guard;
\ir 2026-11-16-CX-44-short-share-links.down.sql
do $$ begin
 assert not exists(select 1 from information_schema.columns where table_name='pricing_document_share_links' and column_name='short_code');
 assert not exists(select 1 from information_schema.columns where table_name='storefront_links' and column_name='short_code');
end $$;
select 'CX-44 short share link PG17 checks passed' as result;
