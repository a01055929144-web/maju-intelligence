-- CX-121 follow-up draft: company-common documents may keep published prices.
-- Latest-price mode and new priced products still require an explicit customer.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text)') is null
    or to_regprocedure('public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[])') is null
  then raise exception 'cx121_common_dependency_missing'; end if;
  if to_regprocedure('public.pricing_document_extension_review_customer_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text)') is not null
  then raise exception 'cx121_common_already_applied'; end if;
end $$;

alter table public.pricing_document_extension_states alter column customer_id drop not null;

alter function public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb)
  rename to pricing_document_extension_price_fingerprint_customer_v1;
create function public.pricing_document_extension_price_fingerprint_v1(p_company uuid,p_customer uuid,p_content jsonb)
returns text language plpgsql stable security definer set search_path='' as $$
begin
  if p_customer is not null then
    return public.pricing_document_extension_price_fingerprint_customer_v1(p_company,p_customer,p_content);
  end if;
  return (
    select md5(coalesce(jsonb_agg(jsonb_build_object(
      'key',l->>'productId'||':'||coalesce(l->>'promotionId','')||':'||coalesce(l->>'unit',''),
      'price',(l->>'price')::bigint,'source','published','cost',c.purchase_price,
      'promotionRevision',p.revision
    ) order by l->>'productId',coalesce(l->>'promotionId',''),coalesce(l->>'unit','')),'[]'::jsonb)::text)
    from jsonb_array_elements(p_content->'lines') l
    join public.product_catalog c on c.company_id=p_company and c.id=(l->>'productId')::uuid
    left join public.pricing_promotions p on p.company_id=p_company and p.id=nullif(l->>'promotionId','')::uuid
    where coalesce((l->>'visible')::boolean,false)
  );
end $$;

create function public.pricing_document_extension_review_common_keep_v1(
  p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,
  p_valid_until date,p_stage text,p_content jsonb,p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.pricing_documents; base public.pricing_document_versions; state public.pricing_document_extension_states;
  source_content jsonb; candidate jsonb; line jsonb; old_line jsonb; product public.product_catalog;
  new_lines jsonb:='[]'; result_lines jsonb:='[]'; old_keys text[]:='{}'; new_keys text[]:='{}';
  key text; before_price bigint; profit numeric; threshold numeric; removed_n int:=0;
  minimum_profit numeric; report jsonb; fingerprint text;
begin
  if p_actor !~ '^[0-9a-f]{64}$' or p_stage not in ('start','review')
    or p_token_hash !~ '^[0-9a-f]{64}$' or p_valid_until is null then raise exception 'extension_invalid'; end if;
  select * into d from public.pricing_documents where company_id=p_company and id=p_document for update;
  if not found or d.revision<>p_expected or (d.kind='sheet' and not p_manager) or (d.kind='quote' and d.owner_key<>p_actor)
    then raise exception 'extension_stale'; end if;
  select * into base from public.pricing_document_versions where company_id=p_company and document_id=p_document order by version desc limit 1;
  if not found or p_valid_until <= (base.content->>'validUntil')::date then raise exception 'extension_expiry_invalid'; end if;
  if exists(select 1 from public.customer_pricing_document_links where company_id=p_company and document_id=p_document and active)
    then raise exception 'extension_customer_state_changed'; end if;
  if p_stage='start' then
    source_content:=base.content;
    insert into public.pricing_document_extension_states(company_id,document_id,base_version_id,customer_id,mode,draft_revision,actor_key)
      values(p_company,p_document,base.id,null,'keep',p_expected,p_actor)
      on conflict(company_id,document_id) do update set base_version_id=excluded.base_version_id,customer_id=null,mode='keep',
        draft_revision=excluded.draft_revision,actor_key=excluded.actor_key,updated_at=clock_timestamp();
  else
    select * into state from public.pricing_document_extension_states where company_id=p_company and document_id=p_document for update;
    if not found or state.base_version_id<>base.id or state.customer_id is not null or state.mode<>'keep'
      or state.draft_revision<>p_expected or state.actor_key<>p_actor then raise exception 'extension_state_stale'; end if;
    source_content:=p_content;
  end if;
  candidate:=public.pricing_p1_clean(p_company,jsonb_set(source_content,'{validUntil}',to_jsonb(p_valid_until::text)));
  if exists(
    select 1 from jsonb_array_elements(candidate->'lines') next_line
    where not exists(select 1 from jsonb_array_elements(base.content->'lines') prior
      where prior->>'productId'=next_line->>'productId'
        and coalesce(prior->>'promotionId','')=coalesce(next_line->>'promotionId','')
        and coalesce(prior->>'unit','')=coalesce(next_line->>'unit',''))
  ) then raise exception 'extension_common_new_price_required'; end if;
  select coalesce(default_margin_bp/100.0,0) into threshold from public.pricing_settings where company_id=p_company;
  threshold:=coalesce(threshold,0);
  for old_line in select value from jsonb_array_elements(base.content->'lines') loop
    if coalesce((old_line->>'visible')::boolean,false) then old_keys:=array_append(old_keys,old_line->>'productId'||':'||coalesce(old_line->>'promotionId','')||':'||coalesce(old_line->>'unit','')); end if;
  end loop;
  for line in select value from jsonb_array_elements(candidate->'lines') loop
    select value into old_line from jsonb_array_elements(base.content->'lines') where value->>'productId'=line->>'productId'
      and coalesce(value->>'promotionId','')=coalesce(line->>'promotionId','') and coalesce(value->>'unit','')=coalesce(line->>'unit','') limit 1;
    if (line->>'price')::bigint is distinct from (old_line->>'price')::bigint then raise exception 'extension_common_price_change_forbidden'; end if;
    if not coalesce((line->>'visible')::boolean,false) then new_lines:=new_lines||jsonb_build_array(line); continue; end if;
    key:=line->>'productId'||':'||coalesce(line->>'promotionId','')||':'||coalesce(line->>'unit',''); new_keys:=array_append(new_keys,key);
    select * into product from public.product_catalog where company_id=p_company and id=(line->>'productId')::uuid and is_active;
    if not found then raise exception 'extension_product_unavailable'; end if;
    before_price:=(old_line->>'price')::bigint;
    profit:=case when before_price>0 and product.purchase_price is not null then round((before_price-product.purchase_price)*100.0/before_price,2) end;
    if profit is not null then minimum_profit:=least(coalesce(minimum_profit,profit),profit); end if;
    new_lines:=new_lines||jsonb_build_array(line);
    result_lines:=result_lines||jsonb_build_array(jsonb_build_object('key',key,'name',line->>'displayName',
      'source',case when nullif(line->>'promotionId','') is null then 'base' else 'promotion' end,
      'promiseUntil',(base.content->>'validUntil')::date,'before',before_price,'calculated',before_price,
      'price',before_price,'difference',0,'profitRate',profit,'belowThreshold',profit is not null and profit<threshold,'manual',false));
  end loop;
  candidate:=jsonb_set(candidate,'{lines}',new_lines);
  select count(*) into removed_n from unnest(old_keys) x where not (x=any(new_keys));
  fingerprint:=public.pricing_document_extension_price_fingerprint_v1(p_company,null,candidate);
  report:=jsonb_build_object('documentId',p_document,'revision',p_expected,'mode','keep','content',candidate,
    'summary',jsonb_build_object('unchanged',cardinality(new_keys),'changed',0,'added',0,'removed',removed_n),
    'loweredProfitCount',0,'minimumProfitRate',minimum_profit,'lines',result_lines);
  insert into public.pricing_document_extension_reviews(token_hash,company_id,document_id,base_version_id,draft_revision,mode,actor_key,content_hash,price_fingerprint,result)
    values(p_token_hash,p_company,p_document,base.id,p_expected,'keep',p_actor,md5(candidate::text),fingerprint,report);
  return report;
end $$;

alter function public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text)
  rename to pricing_document_extension_review_customer_v1;
create function public.pricing_document_extension_review_v1(
  p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,p_mode text,
  p_valid_until date,p_stage text,p_content jsonb,p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  begin
    return public.pricing_document_extension_review_customer_v1(p_company,p_actor,p_manager,p_document,p_expected,p_mode,p_valid_until,p_stage,p_content,p_token_hash);
  exception when raise_exception then
    if sqlerrm='extension_customer_required' and p_mode='keep' then
      return public.pricing_document_extension_review_common_keep_v1(p_company,p_actor,p_manager,p_document,p_expected,p_valid_until,p_stage,p_content,p_token_hash);
    end if;
    raise;
  end;
end $$;

alter function public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[])
  rename to pricing_document_extension_catalog_customer_v1;
create function public.pricing_document_extension_catalog_v1(p_company uuid,p_actor text,p_manager boolean,p_document uuid,p_expected integer,p_mode text,p_product_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.pricing_document_extension_states where company_id=p_company and document_id=p_document and customer_id is null)
    then raise exception 'extension_common_new_price_required'; end if;
  return public.pricing_document_extension_catalog_customer_v1(p_company,p_actor,p_manager,p_document,p_expected,p_mode,p_product_ids);
end $$;

create function public.pricing_document_extension_policy_v1(p_company uuid,p_actor text,p_manager boolean,p_document uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.pricing_documents; customer uuid;
begin
  select * into d from public.pricing_documents where company_id=p_company and id=p_document;
  if not found or (d.kind='sheet' and not p_manager) or (d.kind='quote' and d.owner_key<>p_actor)
    then raise exception 'extension_not_found'; end if;
  select customer_id into customer from public.customer_pricing_document_links
    where company_id=p_company and document_id=p_document and active
    order by linked_at desc,id desc limit 1;
  return jsonb_build_object('customerLinked',customer is not null,
    'allowedModes',case when customer is null then jsonb_build_array('keep') else jsonb_build_array('keep','latest') end,
    'canAddProducts',customer is not null,
    'reason',case when customer is null then 'company_common_keep_only' else 'customer_prices_available' end);
end $$;

revoke all on function public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb),
  public.pricing_document_extension_price_fingerprint_customer_v1(uuid,uuid,jsonb),
  public.pricing_document_extension_review_customer_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_customer_v1(uuid,text,boolean,uuid,integer,text,uuid[]),
  public.pricing_document_extension_review_common_keep_v1(uuid,text,boolean,uuid,integer,date,text,jsonb,text),
  public.pricing_document_extension_policy_v1(uuid,text,boolean,uuid),
  public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]),
  public.pricing_document_extension_policy_v1(uuid,text,boolean,uuid) to service_role;
commit;
