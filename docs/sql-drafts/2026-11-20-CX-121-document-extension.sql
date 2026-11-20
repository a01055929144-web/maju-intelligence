-- CX-121 review draft only. Requires CX-120. Do not apply to production without separate approval.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)') is null
    or to_regprocedure('public.pricing_p1_clean(uuid,jsonb)') is null
    or to_regclass('public.pricing_document_share_links') is null
    or to_regclass('public.customer_pricing_document_links') is null then
    raise exception 'cx121_dependency_missing';
  end if;
end $$;

create table public.pricing_document_extension_states (
  company_id uuid not null,
  document_id uuid not null,
  base_version_id uuid not null,
  customer_id uuid not null,
  mode text not null check (mode in ('keep','latest')),
  draft_revision integer not null check (draft_revision > 0),
  actor_key text not null check (actor_key ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (company_id, document_id),
  foreign key (company_id, document_id) references public.pricing_documents(company_id,id) on delete cascade,
  foreign key (company_id, document_id, base_version_id)
    references public.pricing_document_versions(company_id,document_id,id) on delete restrict
);

create table public.pricing_document_extension_reviews (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  company_id uuid not null,
  document_id uuid not null,
  base_version_id uuid not null,
  draft_revision integer not null,
  mode text not null check (mode in ('keep','latest')),
  actor_key text not null check (actor_key ~ '^[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{32}$'),
  price_fingerprint text not null check (price_fingerprint ~ '^[0-9a-f]{32}$'),
  result jsonb not null,
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  used_at timestamptz,
  foreign key (company_id, document_id) references public.pricing_documents(company_id,id) on delete cascade,
  foreign key (company_id, document_id, base_version_id)
    references public.pricing_document_versions(company_id,document_id,id) on delete restrict
);
create index pricing_document_extension_reviews_expiry_idx on public.pricing_document_extension_reviews(expires_at);

create table public.pricing_document_extension_publishes (
  company_id uuid not null,
  document_id uuid not null,
  idempotency_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  base_version_id uuid not null,
  result_version_id uuid not null,
  mode text not null check (mode in ('keep','latest')),
  actor_key text not null check (actor_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (company_id,document_id,idempotency_key),
  foreign key (company_id,document_id,base_version_id)
    references public.pricing_document_versions(company_id,document_id,id) on delete restrict,
  foreign key (company_id,document_id,result_version_id)
    references public.pricing_document_versions(company_id,document_id,id) on delete restrict
);

create table public.pricing_document_link_heads (
  company_id uuid not null,
  document_id uuid not null,
  current_version_id uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (company_id,document_id),
  foreign key (company_id,document_id) references public.pricing_documents(company_id,id) on delete cascade,
  foreign key (company_id,document_id,current_version_id)
    references public.pricing_document_versions(company_id,document_id,id) on delete restrict
);
create table public.pricing_document_share_link_heads (
  company_id uuid not null,
  share_link_id uuid not null,
  document_id uuid not null,
  primary key (company_id,share_link_id),
  foreign key (company_id,share_link_id) references public.pricing_document_share_links(company_id,id) on delete cascade,
  foreign key (company_id,document_id) references public.pricing_document_link_heads(company_id,document_id) on delete cascade
);

alter table public.pricing_document_extension_states enable row level security;
alter table public.pricing_document_extension_reviews enable row level security;
alter table public.pricing_document_extension_publishes enable row level security;
alter table public.pricing_document_link_heads enable row level security;
alter table public.pricing_document_share_link_heads enable row level security;
revoke all on public.pricing_document_extension_states, public.pricing_document_extension_reviews,
  public.pricing_document_extension_publishes, public.pricing_document_link_heads,
  public.pricing_document_share_link_heads from public, anon, authenticated, service_role;
grant select,insert,update,delete on public.pricing_document_extension_states, public.pricing_document_extension_reviews to service_role;
grant select,insert on public.pricing_document_extension_publishes to service_role;
grant select,insert,update on public.pricing_document_link_heads, public.pricing_document_share_link_heads to service_role;

create function public.pricing_document_extension_price_fingerprint_v1(p_company uuid,p_customer uuid,p_content jsonb)
returns text language sql stable security definer set search_path='' as $$
  select md5(coalesce(jsonb_agg(jsonb_build_object(
    'key',l->>'productId'||':'||coalesce(l->>'promotionId','')||':'||coalesce(l->>'unit',''),
    'price',case when nullif(l->>'promotionId','') is not null then p.price else x.price end,
    'source',case when nullif(l->>'promotionId','') is not null then 'promotion' else x.source end,
    'cost',c.purchase_price,'promotionRevision',p.revision
  ) order by l->>'productId',coalesce(l->>'promotionId',''),coalesce(l->>'unit','')),'[]'::jsonb)::text)
  from jsonb_array_elements(p_content->'lines') l
  join public.product_catalog c on c.company_id=p_company and c.id=(l->>'productId')::uuid
  left join public.pricing_promotions p on p.company_id=p_company and p.id=nullif(l->>'promotionId','')::uuid
  left join lateral public.self_order_price_v2(p_company,p_customer,c.id,
    (current_timestamp at time zone 'Asia/Seoul')::date,false) x on nullif(l->>'promotionId','') is null
  where coalesce((l->>'visible')::boolean,false)
$$;

create function public.pricing_document_extension_review_v1(
  p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,p_mode text,
  p_valid_until date,p_stage text,p_content jsonb,p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.pricing_documents; base public.pricing_document_versions; state public.pricing_document_extension_states;
  source_content jsonb; candidate jsonb; line jsonb; old_line jsonb; priced record; promo public.pricing_promotions;
  product public.product_catalog; result_lines jsonb:='[]'; new_lines jsonb:='[]'; old_keys text[]:='{}'; new_keys text[]:='{}';
  key text; candidate_price bigint; calculated bigint; before_price bigint; profit numeric; before_profit numeric;
  price_source text; promise_until date;
  threshold numeric; unchanged_n int:=0; changed_n int:=0; added_n int:=0; removed_n int:=0;
  lowered_n int:=0; minimum_profit numeric; fingerprint text; report jsonb; customer uuid;
begin
  if p_actor !~ '^[0-9a-f]{64}$' or p_mode not in ('keep','latest') or p_stage not in ('start','review')
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_valid_until is null then raise exception 'extension_invalid'; end if;
  select * into d from public.pricing_documents where company_id=p_company and id=p_document for update;
  if not found or d.revision<>p_expected or (d.kind='sheet' and not p_manager) or (d.kind='quote' and d.owner_key<>p_actor)
    then raise exception 'extension_stale'; end if;
  select * into base from public.pricing_document_versions where company_id=p_company and document_id=p_document order by version desc limit 1;
  if not found or p_valid_until <= (base.content->>'validUntil')::date then raise exception 'extension_expiry_invalid'; end if;
  select customer_id into customer from public.customer_pricing_document_links where company_id=p_company and document_id=p_document
    and active order by (document_version_id=base.id) desc,linked_at desc,id desc limit 1;
  if customer is null then raise exception 'extension_customer_required'; end if;
  if p_stage='start' then
    source_content:=base.content;
    insert into public.pricing_document_extension_states(company_id,document_id,base_version_id,customer_id,mode,draft_revision,actor_key)
      values(p_company,p_document,base.id,customer,p_mode,p_expected,p_actor)
      on conflict(company_id,document_id) do update set base_version_id=excluded.base_version_id,customer_id=excluded.customer_id,mode=excluded.mode,
        draft_revision=excluded.draft_revision,actor_key=excluded.actor_key,updated_at=clock_timestamp();
  else
    select * into state from public.pricing_document_extension_states where company_id=p_company and document_id=p_document for update;
    if not found or state.base_version_id<>base.id or state.customer_id<>customer or state.mode<>p_mode or state.draft_revision<>p_expected or state.actor_key<>p_actor
      then raise exception 'extension_state_stale'; end if;
    source_content:=p_content;
  end if;
  candidate:=public.pricing_p1_clean(p_company,jsonb_set(source_content,'{validUntil}',to_jsonb(p_valid_until::text)));
  for old_line in select value from jsonb_array_elements(base.content->'lines') loop
    if coalesce((old_line->>'visible')::boolean,false) then old_keys:=array_append(old_keys,old_line->>'productId'||':'||coalesce(old_line->>'promotionId','')||':'||coalesce(old_line->>'unit','')); end if;
  end loop;
  select coalesce(default_margin_bp/100.0,0) into threshold from public.pricing_settings where company_id=p_company;
  threshold:=coalesce(threshold,0);
  for line in select value from jsonb_array_elements(candidate->'lines') loop
    if not coalesce((line->>'visible')::boolean,false) then
      new_lines:=new_lines||jsonb_build_array(line);
      continue;
    end if;
    key:=line->>'productId'||':'||coalesce(line->>'promotionId','')||':'||coalesce(line->>'unit',''); new_keys:=array_append(new_keys,key);
    select * into product from public.product_catalog where company_id=p_company and id=(line->>'productId')::uuid and is_active;
    if not found then raise exception 'extension_product_unavailable'; end if;
    select value into old_line from jsonb_array_elements(base.content->'lines') where value->>'productId'=line->>'productId'
      and coalesce(value->>'promotionId','')=coalesce(line->>'promotionId','') and coalesce(value->>'unit','')=coalesce(line->>'unit','') limit 1;
    before_price:=case when old_line is null then null else (old_line->>'price')::bigint end;
    if nullif(line->>'promotionId','') is not null then
      select * into promo from public.pricing_promotions where company_id=p_company and id=(line->>'promotionId')::uuid
        and product_id=product.id and (current_timestamp at time zone 'Asia/Seoul')::date between starts_on and ends_on and stock is distinct from 0;
      if not found then raise exception 'extension_promotion_unavailable'; end if;
      calculated:=promo.price; candidate_price:=case when p_stage='start' then promo.price else (line->>'price')::bigint end;
      line:=jsonb_set(line,'{price}',to_jsonb(candidate_price)); price_source:='promotion'; promise_until:=null;
    else
      select * into priced from public.self_order_price_v2(p_company,customer,product.id,
        (current_timestamp at time zone 'Asia/Seoul')::date,false);
      if not found or priced.market or priced.price is null or priced.source not in ('catalog','base') then raise exception 'extension_price_unavailable'; end if;
      calculated:=priced.price;
      candidate_price:=case when p_stage='start' and p_mode='keep' then coalesce(before_price,calculated)
        when p_stage='start' then calculated else (line->>'price')::bigint end;
      line:=jsonb_set(line,'{price}',to_jsonb(candidate_price));
      price_source:=priced.source; promise_until:=(base.content->>'validUntil')::date;
    end if;
    new_lines:=new_lines||jsonb_build_array(line);
    profit:=case when candidate_price>0 and product.purchase_price is not null then round((candidate_price-product.purchase_price)*100.0/candidate_price,2) end;
    before_profit:=case when before_price>0 and product.purchase_price is not null then round((before_price-product.purchase_price)*100.0/before_price,2) end;
    if profit is not null then minimum_profit:=least(coalesce(minimum_profit,profit),profit); end if;
    if profit is not null and before_profit is not null and profit<before_profit then lowered_n:=lowered_n+1; end if;
    result_lines:=result_lines||jsonb_build_array(jsonb_build_object('key',key,'name',line->>'displayName',
      'source',price_source,'promiseUntil',promise_until,'before',before_price,'calculated',calculated,
      'price',candidate_price,'difference',candidate_price-calculated,'profitRate',profit,
      'belowThreshold',profit is not null and profit<threshold,'manual',candidate_price<>calculated));
  end loop;
  candidate:=jsonb_set(candidate,'{lines}',new_lines);
  select count(*) into removed_n from unnest(old_keys) x where not (x=any(new_keys));
  select count(*) into added_n from unnest(new_keys) x where not (x=any(old_keys));
  select count(*) into changed_n from jsonb_array_elements(result_lines) x where x->>'key'=any(old_keys) and (x->>'before')::bigint is distinct from (x->>'price')::bigint;
  unchanged_n:=cardinality(new_keys)-added_n-changed_n;
  fingerprint:=public.pricing_document_extension_price_fingerprint_v1(p_company,customer,candidate);
  report:=jsonb_build_object('documentId',p_document,'revision',p_expected,'mode',p_mode,'content',candidate,
    'summary',jsonb_build_object('unchanged',unchanged_n,'changed',changed_n,'added',added_n,'removed',removed_n),
    'loweredProfitCount',lowered_n,'minimumProfitRate',minimum_profit,'lines',result_lines);
  insert into public.pricing_document_extension_reviews(token_hash,company_id,document_id,base_version_id,draft_revision,mode,actor_key,content_hash,price_fingerprint,result)
    values(p_token_hash,p_company,p_document,base.id,p_expected,p_mode,p_actor,md5(candidate::text),fingerprint,report);
  return report;
end $$;

create function public.pricing_document_extension_catalog_v1(p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,p_mode text,p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.pricing_documents; state public.pricing_document_extension_states;
begin
  select * into d from public.pricing_documents where company_id=p_company and id=p_document;
  select * into state from public.pricing_document_extension_states where company_id=p_company and document_id=p_document;
  if not found or d.revision<>p_expected or state.mode<>p_mode or state.actor_key<>p_actor or cardinality(p_product_ids) not between 1 and 100
    or (d.kind='sheet' and not p_manager) or (d.kind='quote' and d.owner_key<>p_actor) then raise exception 'extension_stale'; end if;
  return (select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',coalesce(c.sales_product_name,c.canonical_name,c.purchase_product_name),
    'displayName',coalesce(c.sales_product_name,''),'brand',coalesce(c.brand_name,''),'spec',coalesce(c.sales_spec,''),'unit',coalesce(c.sales_unit,''),
    'price',x.price,'taxType',x.tax_type,'source',x.source)),'[]'::jsonb))
    from public.product_catalog c left join lateral public.self_order_price_v2(p_company,state.customer_id,c.id,
      (current_timestamp at time zone 'Asia/Seoul')::date,false) x on true
    where c.company_id=p_company and c.id=any(p_product_ids) and c.is_active and not x.market and x.price is not null);
end $$;

create function public.pricing_document_extension_save_v1(p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,p_mode text,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.pricing_documents; state public.pricing_document_extension_states; clean jsonb;
begin
  select * into d from public.pricing_documents where company_id=p_company and id=p_document for update;
  select * into state from public.pricing_document_extension_states where company_id=p_company and document_id=p_document for update;
  if d.id is null or d.revision<>p_expected or state.mode<>p_mode or state.draft_revision<>p_expected or state.actor_key<>p_actor
    or (d.kind='sheet' and not p_manager) or (d.kind='quote' and d.owner_key<>p_actor) then raise exception 'extension_stale'; end if;
  clean:=public.pricing_p1_clean(p_company,p_content);
  update public.pricing_documents set content=clean,revision=revision+1,updated_at=clock_timestamp()
    where company_id=p_company and id=p_document returning * into d;
  update public.pricing_document_extension_states set draft_revision=d.revision,updated_at=clock_timestamp()
    where company_id=p_company and document_id=p_document;
  return jsonb_build_object('id',d.id,'revision',d.revision,'content',d.content,'updatedAt',d.updated_at);
end $$;

create function public.pricing_document_extension_publish_v1(p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,p_mode text,p_token_hash text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.pricing_documents; state public.pricing_document_extension_states; review public.pricing_document_extension_reviews;
  prior public.pricing_document_extension_publishes; v public.pricing_document_versions; request_hash text; next_version integer;
begin
  if p_idempotency_key is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'extension_invalid'; end if;
  select * into d from public.pricing_documents where company_id=p_company and id=p_document for update;
  if d.id is null or (d.kind='sheet' and not p_manager) or (d.kind='quote' and d.owner_key<>p_actor) then raise exception 'extension_not_found'; end if;
  request_hash:=md5(concat_ws(':',p_company,p_document,p_expected,p_mode,p_token_hash,p_actor));
  select * into prior from public.pricing_document_extension_publishes where company_id=p_company and document_id=p_document and idempotency_key=p_idempotency_key;
  if found then
    if prior.request_fingerprint<>request_hash then raise exception 'extension_idempotency_conflict'; end if;
    select * into v from public.pricing_document_versions where company_id=p_company and document_id=p_document and id=prior.result_version_id;
    return public.pricing_p1_version(p_company,v);
  end if;
  select * into state from public.pricing_document_extension_states where company_id=p_company and document_id=p_document for update;
  select * into review from public.pricing_document_extension_reviews where token_hash=p_token_hash for update;
  if review.token_hash is null or review.company_id<>p_company or review.document_id<>p_document or review.actor_key<>p_actor
    or review.mode<>p_mode or review.draft_revision<>p_expected or review.expires_at<=clock_timestamp() or review.used_at is not null
    or state.base_version_id<>review.base_version_id or state.draft_revision<>p_expected or state.mode<>p_mode
    or d.revision<>p_expected or review.content_hash<>md5(d.content::text)
    or review.price_fingerprint<>public.pricing_document_extension_price_fingerprint_v1(p_company,state.customer_id,d.content)
    then raise exception 'extension_review_stale'; end if;
  select coalesce(max(version),0)+1 into next_version from public.pricing_document_versions where company_id=p_company and document_id=p_document;
  insert into public.pricing_document_versions(company_id,document_id,version,revision,content)
    values(p_company,p_document,next_version,p_expected,d.content) returning * into v;
  insert into public.pricing_document_link_heads(company_id,document_id,current_version_id) values(p_company,p_document,v.id)
    on conflict(company_id,document_id) do update set current_version_id=excluded.current_version_id,updated_at=clock_timestamp();
  insert into public.pricing_document_share_link_heads(company_id,share_link_id,document_id)
    select company_id,id,document_id from public.pricing_document_share_links where company_id=p_company and document_id=p_document
    on conflict(company_id,share_link_id) do nothing;
  insert into public.pricing_document_extension_publishes(company_id,document_id,idempotency_key,request_fingerprint,base_version_id,result_version_id,mode,actor_key)
    values(p_company,p_document,p_idempotency_key,request_hash,review.base_version_id,v.id,p_mode,p_actor);
  update public.pricing_document_extension_reviews set used_at=clock_timestamp() where token_hash=p_token_hash;
  delete from public.pricing_document_extension_states where company_id=p_company and document_id=p_document;
  return public.pricing_p1_version(p_company,v);
end $$;

create function public.resolve_pricing_document_link_head_v1(p_share_link uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select coalesce(h.current_version_id,l.document_version_id)
  from public.pricing_document_share_links l
  left join public.pricing_document_share_link_heads m on m.company_id=l.company_id and m.share_link_id=l.id
  left join public.pricing_document_link_heads h on h.company_id=m.company_id and h.document_id=m.document_id
  where l.id=p_share_link
$$;

revoke all on function public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb),
  public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]),
  public.pricing_document_extension_save_v1(uuid,text,boolean,uuid,integer,text,jsonb),
  public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid),
  public.resolve_pricing_document_link_head_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]),
  public.pricing_document_extension_save_v1(uuid,text,boolean,uuid,integer,text,jsonb),
  public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid),
  public.resolve_pricing_document_link_head_v1(uuid) to service_role;

commit;
