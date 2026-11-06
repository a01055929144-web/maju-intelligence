-- REVIEW-ONLY 09 DRAFT. No operating execution / migration / feature activation approval.
-- Requires applied P1 + S2 tables. One metadata table; no document, send or price backfill.
begin;

create table public.pricing_document_share_links (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null,
  document_version_id uuid not null,
  lead_id uuid not null,
  idempotency_key uuid not null,
  created_by_key text not null check (created_by_key ~ '^[0-9a-f]{64}$'),
  token_nonce text not null check (token_nonce ~ '^[0-9a-f]{32}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  ttl_days smallint not null default 14 constraint pricing_share_ttl_check check (ttl_days between 1 and 30),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  send_id uuid,
  unique(company_id,id), unique(company_id,idempotency_key), unique(company_id,send_id),
  foreign key(company_id,document_id,document_version_id)
    references public.pricing_document_versions(company_id,document_id,id) on delete restrict,
  foreign key(company_id,lead_id) references public.business_permit_leads(company_id,id) on delete restrict,
  foreign key(company_id,send_id) references public.pricing_document_sends(company_id,id) on delete restrict,
  constraint pricing_share_expiry_check check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

create function public.validate_pricing_document_share_link() returns trigger
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
create trigger validate_pricing_document_share_link before insert or update on public.pricing_document_share_links
  for each row execute function public.validate_pricing_document_share_link();

alter table public.pricing_document_share_links enable row level security;
revoke all on public.pricing_document_share_links from public,anon,authenticated,service_role;
grant select,insert,update on public.pricing_document_share_links to service_role;
revoke all on function public.validate_pricing_document_share_link() from public,anon,authenticated;
grant execute on function public.validate_pricing_document_share_link() to service_role;
comment on table public.pricing_document_share_links is '09 review-only lead share metadata: version-pinned, delivery recorded separately; no raw token or price payload';

-- Explicit actual-delivery only: one transaction for send + contact history + link binding.
-- Uses the existing lead_actions table/metadata columns; never stores a URL or raw token.
create function public.record_pricing_lead_share_delivery(
  p_company_id uuid,p_actor text,p_share_link_id uuid,p_document_id uuid,p_document_version_id uuid,
  p_lead_id uuid,p_idempotency_key uuid,p_template_id text,p_channel text,p_actor_name text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare l public.pricing_document_share_links%rowtype; d public.pricing_documents%rowtype;
  s public.pricing_document_sends%rowtype; a public.lead_actions%rowtype;
  v_layout text; v_type text; v_result text; v_metadata jsonb;
begin
  if coalesce(p_actor,'') !~ '^[0-9a-f]{64}$' or length(btrim(coalesce(p_actor_name,''))) not between 1 and 80
    or length(btrim(coalesce(p_template_id,''))) not between 1 and 100
    or coalesce(p_channel,'') not in ('link','kakao','qr','print','staff') then raise exception 'share_delivery_invalid'; end if;
  select * into l from pricing_document_share_links where company_id=p_company_id and id=p_share_link_id for update;
  if not found or l.created_by_key is distinct from p_actor then raise exception 'share_document_not_found'; end if;
  if l.document_id is distinct from p_document_id or l.document_version_id is distinct from p_document_version_id
    or l.lead_id is distinct from p_lead_id or l.idempotency_key is distinct from p_idempotency_key then raise exception 'share_delivery_conflict'; end if;
  select * into d from pricing_documents where company_id=p_company_id and id=l.document_id for share;
  if not found or d.kind not in ('sheet','quote') or (d.kind='quote' and d.owner_key is distinct from p_actor)
    or to_jsonb(d)->>'archived_at' is not null then raise exception 'share_document_not_found'; end if;
  perform 1 from business_permit_leads where company_id=p_company_id and id=l.lead_id and merged_into_lead_id is null for share;
  if not found then raise exception 'share_lead_not_found'; end if;
  select content->>'layout' into v_layout from pricing_document_versions where company_id=p_company_id and document_id=l.document_id and id=l.document_version_id;
  if not found or coalesce(v_layout,'') not in ('auto','table','cards') then raise exception 'share_document_not_found'; end if;
  insert into pricing_document_sends(company_id,document_id,document_version_id,lead_id,customer_id,template_id,layout,channel,idempotency_key,sent_by_key)
    values(p_company_id,l.document_id,l.document_version_id,l.lead_id,null,btrim(p_template_id),v_layout,p_channel,l.idempotency_key,p_actor)
    on conflict(company_id,idempotency_key) do nothing;
  select * into s from pricing_document_sends where company_id=p_company_id and idempotency_key=l.idempotency_key for update;
  if not found or s.document_id is distinct from l.document_id or s.document_version_id is distinct from l.document_version_id
    or s.lead_id is distinct from l.lead_id or s.customer_id is not null or s.template_id is distinct from btrim(p_template_id)
    or s.layout is distinct from v_layout or s.channel is distinct from p_channel or s.sent_by_key is distinct from p_actor then raise exception 'share_delivery_conflict'; end if;
  v_type:=case when d.kind='quote' then 'quote' else 'dm' end;
  v_result:=case when d.kind='quote' then '견적 전달' else '단가표 전달' end;
  v_metadata:=jsonb_build_object('pricingDocumentId',l.document_id,'documentVersionId',l.document_version_id,
    'shareLinkId',l.id,'sendId',s.id,'idempotencyKey',l.idempotency_key);
  -- A send UUID is also its contact-action UUID: retry/concurrency never generate another action.
  insert into lead_actions(id,company_id,lead_id,action_type,result,memo,actor_name,metadata)
    values(s.id,p_company_id,l.lead_id,v_type,v_result,'게시 문서 링크 전달',btrim(p_actor_name),v_metadata)
    on conflict(id) do nothing;
  select * into a from lead_actions where id=s.id;
  if not found or a.company_id is distinct from p_company_id or a.lead_id is distinct from l.lead_id
    or a.action_type is distinct from v_type or a.result is distinct from v_result or a.metadata is distinct from v_metadata then raise exception 'share_action_conflict'; end if;
  if l.send_id is not null and l.send_id is distinct from s.id then raise exception 'share_delivery_conflict'; end if;
  update pricing_document_share_links set send_id=s.id where company_id=p_company_id and id=l.id and send_id is null;
  return jsonb_build_object('sendId',s.id,'leadActionId',a.id,'documentId',l.document_id,'documentVersionId',l.document_version_id);
end $$;
revoke all on function public.record_pricing_lead_share_delivery(uuid,text,uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_pricing_lead_share_delivery(uuid,text,uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;

commit;
