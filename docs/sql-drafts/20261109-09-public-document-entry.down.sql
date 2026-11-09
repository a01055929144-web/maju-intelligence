-- REVIEW ONLY. Stop generic issuance first. Preserve existing shares and all business rows.
begin;
lock table public.pricing_document_share_links in access exclusive mode;
do $$ begin
  if exists(select from public.pricing_document_share_links where lead_id is null) then
    raise exception 'public_document_entry_down_refused_links_exist';
  end if;
end $$;
alter table public.pricing_document_share_links alter column lead_id set not null;
create or replace function public.validate_pricing_document_share_link() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.pricing_documents%rowtype; content jsonb; s public.pricing_document_sends%rowtype;
begin
  if tg_op='INSERT' then
    if new.send_id is not null then raise exception 'share_prepare_is_not_delivery'; end if;
    select * into d from public.pricing_documents where company_id=new.company_id and id=new.document_id;
    if not found or d.kind not in ('sheet','quote') or (d.kind='quote' and d.owner_key is distinct from new.created_by_key)
      or to_jsonb(d)->>'archived_at' is not null then raise exception 'share_document_not_found'; end if;
    select v.content into content from public.pricing_document_versions v
      where v.company_id=new.company_id and v.document_id=new.document_id and v.id=new.document_version_id;
    if not found then raise exception 'share_version_not_found'; end if;
    if coalesce(content->>'validUntil','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'share_document_date_invalid'; end if;
    if (content->>'validUntil')::date < (clock_timestamp() at time zone 'Asia/Seoul')::date then raise exception 'share_document_expired'; end if;
    if not exists(select from public.business_permit_leads where company_id=new.company_id and id=new.lead_id and merged_into_lead_id is null)
      then raise exception 'share_lead_not_found'; end if;
    new.created_at:=clock_timestamp();
    new.expires_at:=new.created_at + make_interval(days=>new.ttl_days);
  else
    if row(new.id,new.company_id,new.document_id,new.document_version_id,new.lead_id,new.idempotency_key,
      new.created_by_key,new.token_nonce,new.token_hash,new.ttl_days,new.created_at,new.expires_at)
      is distinct from row(old.id,old.company_id,old.document_id,old.document_version_id,old.lead_id,old.idempotency_key,
      old.created_by_key,old.token_nonce,old.token_hash,old.ttl_days,old.created_at,old.expires_at)
      then raise exception 'share_context_immutable'; end if;
    if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then raise exception 'share_revocation_final'; end if;
    if old.send_id is not null and new.send_id is distinct from old.send_id then raise exception 'share_send_immutable'; end if;
    if new.send_id is distinct from old.send_id then
      select * into s from public.pricing_document_sends where company_id=new.company_id and id=new.send_id;
      if not found or s.document_id<>new.document_id or s.document_version_id<>new.document_version_id
        or s.lead_id is distinct from new.lead_id or s.customer_id is not null
        or s.idempotency_key<>new.idempotency_key or s.sent_by_key is distinct from new.created_by_key then raise exception 'share_send_mismatch'; end if;
    end if;
  end if;
  return new;
end $$;

commit;
