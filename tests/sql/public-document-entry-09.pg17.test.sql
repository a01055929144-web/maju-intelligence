\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'pricing_public_document_entry_test' or current_setting('server_version_num')::integer/10000<>17
    then raise exception 'isolated_exact_PG17_database_required'; end if;
end $$;
\ir pricing-lead-document-share-migrations.pg17.test.sql
create temp table entry_before as select
 (select count(*) from normalized_customers) customers,
 (select count(*) from pricing_document_sends) sends,
 (select count(*) from lead_actions) actions;
create temp table original_share_guard as select prosrc,proacl from pg_proc where oid='public.validate_pricing_document_share_link()'::regprocedure;
\ir ../../docs/sql-drafts/20261109-09-public-document-entry.sql
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001',document_id,version_id,null,
 '70000000-0000-4000-8000-000000000009',repeat('a',64),repeat('c',32),repeat('d',64) from integration_refs;
do $$ begin
  if (select count(*) from pricing_document_share_links where lead_id is null)<>1 then raise exception 'public_link_missing'; end if;
  if not exists(select from pricing_document_share_links l join integration_refs r on r.version_id=l.document_version_id
    where l.lead_id is null and l.ttl_days is null and l.expires_at=((r.version_content->>'validUntil')::date+366)::timestamp at time zone 'Asia/Seoul'
      and l.expires_at>l.created_at+interval '30 days') then raise exception 'public_printed_QR_period_not_derived_from_version'; end if;
  if not exists(select from entry_before where customers=(select count(*) from normalized_customers)
    and sends=(select count(*) from pricing_document_sends) and actions=(select count(*) from lead_actions)) then raise exception 'view_metadata_created_business_records'; end if;
  begin
    update pricing_document_share_links set lead_id='30000000-0000-4000-8000-000000000001';
    raise exception 'immutable_lead_allowed';
  exception when raise_exception then if sqlerrm<>'share_context_immutable' then raise; end if; end;
  begin
    update pricing_document_share_links set send_id=(select send_id from integration_refs);
    raise exception 'public_link_bound_delivery';
  exception when raise_exception then if sqlerrm<>'share_public_is_not_delivery' then raise; end if; end;
end $$;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261109-09-public-document-entry.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if (select count(*) from pricing_document_share_links where lead_id is null)<>1 then raise exception 'refused_down_lost_link'; end if;
end $$;
update pricing_document_share_links set revoked_at=clock_timestamp();
do $$ begin
  begin
    update pricing_document_share_links set revoked_at=null;
    raise exception 'revocation_undone';
  exception when raise_exception then if sqlerrm<>'share_revocation_final' then raise; end if; end;
end $$;
-- Existing lead shares keep their exact original 14-day policy under the new trigger.
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000001',document_id,version_id,
 '30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-00000000000a',repeat('a',64),repeat('e',32),repeat('f',64) from integration_refs;
do $$ begin
  if not exists(select from pricing_document_share_links where lead_id is not null and ttl_days=14 and expires_at=created_at+interval '14 days')
    then raise exception 'legacy_lead_TTL_changed'; end if;
end $$;
-- Fixture-owner cleanup only, never an operating rollback instruction.
delete from pricing_document_share_links where lead_id is null;
\ir ../../docs/sql-drafts/20261109-09-public-document-entry.down.sql
do $$ begin
  if not exists(select from pg_attribute where attrelid='public.pricing_document_share_links'::regclass and attname='lead_id' and attnotnull) then raise exception 'not_null_not_restored'; end if;
  if not exists(select from pg_attribute where attrelid='public.pricing_document_share_links'::regclass and attname='ttl_days' and attnotnull) then raise exception 'legacy_TTL_not_null_not_restored'; end if;
  if not exists(select from original_share_guard s join pg_proc p on p.oid='public.validate_pricing_document_share_link()'::regprocedure and p.prosrc=s.prosrc and p.proacl is not distinct from s.proacl) then raise exception 'original_guard_or_ACL_changed'; end if;
  if not exists(select from integration_refs r join pricing_document_versions v on v.id=r.version_id and v.content=r.version_content
    join pricing_document_sends s on s.id=r.send_id and to_jsonb(s)=r.send_snapshot) then raise exception 'existing_history_changed'; end if;
end $$;
\ir ../../docs/sql-drafts/20261109-09-public-document-entry.sql
-- Real P1/P2 RPC regression: a D+14 price period must not use QR retention as the order-link deadline.
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; a text:=repeat('a',64);
  d uuid:='10000000-0000-4000-8000-000000000009'; customer uuid:='80000000-0000-4000-8000-000000000009';
  price_day date:=(clock_timestamp() at time zone 'Asia/Seoul')::date+14;
  content jsonb; published jsonb; version_id uuid; order_end timestamptz; qr_end timestamptz; link_id uuid; token_hash text;
  candidates jsonb;
begin
  select version_content into content from integration_refs limit 1;
  content:=content || jsonb_build_object('title','synthetic 14-day order cutoff','validUntil',price_day::text);
  perform pricing_p1(c,a,true,'save',jsonb_build_object('id',d,'expected',0,'content',content));
  published:=pricing_p1(c,a,true,'publish',jsonb_build_object('id',d,'expected',1));
  version_id:=(published->>'id')::uuid;
  order_end:=(price_day+1)::timestamp at time zone 'Asia/Seoul';
  qr_end:=order_end+interval '365 days';
  insert into normalized_customers(id,company_id,customer_name) values(customer,c,'synthetic expiry test store');
  insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
    values('60000000-0000-4000-8000-00000000000b',c,d,version_id,null,
      '70000000-0000-4000-8000-00000000000b',a,repeat('b',32),repeat('8',64));
  if not exists(select from pricing_document_share_links where document_version_id=version_id and expires_at=qr_end)
    then raise exception 'QR_retention_changed'; end if;
  candidates:=jsonb_build_array(jsonb_build_object('customerId',customer,'id','90000000-0000-4000-8000-000000000009',
    'nonce',repeat('b',32),'hash',repeat('9',64)));
  begin
    perform * from issue_storefront_links(c,version_id,candidates,qr_end,null,a);
    raise exception 'old_QR_deadline_unexpectedly_accepted';
  exception when raise_exception then if sqlerrm<>'Invalid link issue request' then raise; end if; end;
  select issued_link_id,issued_token_hash into link_id,token_hash from issue_storefront_links(c,version_id,candidates,order_end,null,a);
  if not exists(select from storefront_links where id=link_id and expires_at=order_end and expires_at<qr_end)
    then raise exception 'order_link_not_bound_to_price_cutoff'; end if;
  -- Fixture-only clock-state simulation, preserving expires_at > issued_at. No trigger bypass or schema edits.
  update storefront_links set issued_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' where id=link_id;
  begin
    perform place_store_order(token_hash,price_day,jsonb_build_array(jsonb_build_object(
      'productId','40000000-0000-4000-8000-000000000001','quantity',1)),
      'a0000000-0000-4000-8000-000000000009');
    raise exception 'expired_order_link_accepted';
  exception when raise_exception then if sqlerrm<>'Link unavailable' then raise; end if; end;
  if exists(select from store_orders where document_version_id=version_id) then raise exception 'expired_link_created_order'; end if;
  if not exists(select from pricing_document_share_links where document_version_id=version_id and expires_at=qr_end)
    then raise exception 'expired_order_link_changed_public_QR'; end if;
end $$;
select 'public_document_order_expiry_09_PG17_pass';
select 'public_document_entry_09_PG17_pass';
