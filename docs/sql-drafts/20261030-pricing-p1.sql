-- DRAFT ONLY: never execute in production. Apply once to a NEW disposable local PG16 DB.
-- Requires approved/applied pricing P0 and product_catalog. Flag remains OFF until review.
begin;
create table public.pricing_documents (
 id uuid primary key,company_id uuid not null references public.companies(id) on delete cascade,
 owner_key text not null check(owner_key ~ '^[0-9a-f]{64}$'),kind text not null check(kind in ('sheet','quote')),
 revision integer not null check(revision>0),content jsonb not null,updated_at timestamptz not null default clock_timestamp(),unique(company_id,id)
);
create index pricing_documents_company_updated on public.pricing_documents(company_id,updated_at desc,id);
create table public.pricing_document_versions (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 document_id uuid not null,version integer not null,revision integer not null,content jsonb not null,published_at timestamptz not null default clock_timestamp(),
 unique(company_id,document_id,version),unique(company_id,document_id,revision),
 foreign key(company_id,document_id) references public.pricing_documents(company_id,id) on delete cascade
);
create table public.pricing_promotions (
 id uuid primary key,company_id uuid not null references public.companies(id) on delete cascade,product_id uuid not null,
 name text not null,display_name text not null,starts_on date not null,ends_on date not null check(ends_on>=starts_on),
 purchase_cost numeric(14,2) not null check(purchase_cost>=0),margin_bp integer not null check(margin_bp between 0 and 100000),
 price bigint not null check(price between 0 and 1000000000000),stock bigint check(stock between 0 and 1000000000000),per_store_limit bigint check(per_store_limit between 1 and 1000000000000),
 tax_type text not null check(tax_type in ('taxable','exempt')),allow_sheet boolean not null default false,badge text not null check(badge in ('행사','임박')),revision integer not null,
 unique(company_id,id),foreign key(company_id,product_id) references public.product_catalog(company_id,id) on delete cascade
);
create table public.pricing_product_sets (
 id uuid primary key,company_id uuid not null references public.companies(id) on delete cascade,owner_key text not null,
 name text not null,kind text not null check(kind in ('bundle','template')),shared boolean not null default false,
 product_ids uuid[] not null check(cardinality(product_ids) between 1 and 100),revision integer not null
);
create table public.pricing_print_profiles (
 company_id uuid primary key references public.companies(id) on delete cascade,content jsonb not null,revision integer not null
);
alter table public.pricing_documents enable row level security;
alter table public.pricing_document_versions enable row level security;
alter table public.pricing_promotions enable row level security;
alter table public.pricing_product_sets enable row level security;
alter table public.pricing_print_profiles enable row level security;
revoke all on public.pricing_documents,public.pricing_document_versions,public.pricing_promotions,public.pricing_product_sets,public.pricing_print_profiles from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.pricing_documents,public.pricing_promotions,public.pricing_product_sets,public.pricing_print_profiles to service_role;
grant select,insert on public.pricing_document_versions to service_role;
create function public.pricing_version_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'Published versions are immutable'; end $$;
create trigger pricing_version_immutable before update on public.pricing_document_versions for each row execute function public.pricing_version_immutable();

create function public.pricing_p1_clean(p_company uuid,p_content jsonb) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare l jsonb; result jsonb:='[]'; promo pricing_promotions; item uuid; name text; price numeric; seen text[]:='{}'; key text;
begin
 if coalesce(p_content->>'kind','') not in ('sheet','quote') or coalesce(p_content->>'theme','') not in ('blue','green','mono') or coalesce(p_content->>'layout','') not in ('auto','table','cards') then raise exception 'Invalid document options'; end if;
 if length(trim(coalesce(p_content->>'title',''))) not between 1 and 100 or length(trim(coalesce(p_content->>'companyName',''))) not between 1 and 100 or length(coalesce(p_content->>'contact',''))>100 or length(coalesce(p_content->>'recipient',''))>100 or length(coalesce(p_content->>'footer',''))>400 then raise exception 'Invalid header'; end if;
 if coalesce(p_content->>'validUntil','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_content->>'validUntil')::date,'YYYY-MM-DD')<>p_content->>'validUntil' then raise exception 'Invalid expiry'; end if;
 if jsonb_typeof(p_content->'showPrice') is distinct from 'boolean' or jsonb_typeof(p_content->'showBrand') is distinct from 'boolean' or jsonb_typeof(p_content->'showSpec') is distinct from 'boolean' or jsonb_typeof(p_content->'lines') is distinct from 'array' or jsonb_array_length(p_content->'lines') not between 1 and 100 then raise exception 'Invalid document fields'; end if;
 for l in select * from jsonb_array_elements(p_content->'lines') loop
   item:=(l->>'productId')::uuid;
   if not exists(select from product_catalog where company_id=p_company and id=item and is_active) then raise exception 'Product not found in company'; end if;
   key:=item::text||':'||coalesce(l->>'promotionId','');
   if key=any(seen) then raise exception 'Duplicate product'; end if; seen:=array_append(seen,key);
   name:=trim(coalesce(l->>'displayName',''));price:=(l->>'price')::numeric;
   if length(name) not between 1 and 120 or length(coalesce(l->>'brand',''))>80 or length(coalesce(l->>'spec',''))>80 or length(coalesce(l->>'unit',''))>20 or price is null or price<>trunc(price) or price<0 or price>1000000000000 or coalesce(l->>'taxType','') not in ('taxable','exempt') or jsonb_typeof(l->'visible') is distinct from 'boolean' then raise exception 'Invalid printable line'; end if;
   select * into promo from pricing_promotions where company_id=p_company and id=(l->>'promotionId')::uuid and product_id=item;
   if l->>'promotionId' is not null and not found then raise exception 'Promotion not found'; end if;
   if promo.id is not null and p_content->>'kind'='sheet' and not promo.allow_sheet then raise exception 'Promotion not enabled for sheets'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('productId',item,'displayName',coalesce(promo.display_name,name),'brand',coalesce(l->>'brand',''),'spec',coalesce(l->>'spec',''),'unit',coalesce(l->>'unit',''),'price',coalesce(promo.price,price::bigint),'taxType',coalesce(promo.tax_type,l->>'taxType'),'visible',(l->>'visible')::boolean,'promotionId',promo.id,'startsOn',promo.starts_on,'endsOn',promo.ends_on,'remaining',promo.stock,'badge',coalesce(promo.badge,'')));
 end loop;
 if not exists(select from jsonb_array_elements(result) x where (x->>'visible')::boolean) then raise exception 'No visible products'; end if;
 return jsonb_build_object('kind',p_content->>'kind','title',trim(p_content->>'title'),'companyName',trim(p_content->>'companyName'),'contact',coalesce(p_content->>'contact',''),'recipient',coalesce(p_content->>'recipient',''),'footer',coalesce(p_content->>'footer',''),'validUntil',p_content->>'validUntil','theme',p_content->>'theme','layout',p_content->>'layout','showPrice',p_content->'showPrice','showBrand',p_content->'showBrand','showSpec',p_content->'showSpec','lines',result);
end $$;
create function public.pricing_p1(p_company uuid,p_actor text,p_manager boolean,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid:=(p_payload->>'id')::uuid; expected integer:=(p_payload->>'expected')::integer;
 d pricing_documents; v pricing_document_versions; pr pricing_promotions; st pricing_product_sets;
 clean jsonb; result jsonb; n integer; ids uuid[]; codes text[]; price bigint; bp numeric;
 page integer:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),100000)); q text:=left(coalesce(p_payload->>'search',''),100);
 today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 if p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_manager is null then raise exception 'Actor required'; end if;
 if p_action='catalog' then
   if jsonb_typeof(p_payload->'productCodes')='array' then select coalesce(array_agg(value),'{}'::text[]) into codes from jsonb_array_elements_text(p_payload->'productCodes'); if cardinality(codes)>100 then raise exception 'Too many product codes'; end if; end if;
   if jsonb_typeof(p_payload->'productIds')='array' then select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_payload->'productIds'); if cardinality(ids)>100 then raise exception 'Too many product IDs'; end if; end if;
   select jsonb_build_object('items',coalesce(jsonb_agg(item order by product_id),'[]'::jsonb),'total',(select count(*) from product_catalog c where c.company_id=p_company and c.is_active and (ids is null or c.id=any(ids)) and (codes is null or c.product_code=any(codes)) and (p_manager or nullif(trim(c.sales_product_name),'') is not null) and (q='' or strpos(lower(case when p_manager then coalesce(c.canonical_name,c.purchase_product_name) else c.sales_product_name end),lower(q))>0))) into result
   from (select c.id product_id,jsonb_build_object('id',c.id,'productCode',c.product_code,'name',case when p_manager then coalesce(c.canonical_name,c.purchase_product_name) else c.sales_product_name end,'displayName',coalesce(c.sales_product_name,''),'brand',coalesce(c.brand_name,''),'spec',coalesce(c.sales_spec,''),'unit',coalesce(c.sales_unit,''),'taxType',coalesce(c.tax_type,'unknown'),'price',pricing_p0_price(e.cost,e.effective_margin_bp,e.effective_rounding,e.direct_price)) || case when p_manager then jsonb_build_object('cost',c.purchase_price) else '{}'::jsonb end item
   from product_catalog c join pricing_p0_effective e on e.company_id=c.company_id and e.product_id=c.id
   where c.company_id=p_company and c.is_active and (p_manager or nullif(trim(c.sales_product_name),'') is not null)
   and (ids is null or c.id=any(ids)) and (codes is null or c.product_code=any(codes)) and (q='' or strpos(lower(case when p_manager then coalesce(c.canonical_name,c.purchase_product_name) else c.sales_product_name end),lower(q))>0)
   order by c.id limit case when ids is null and codes is null then 50 else 100 end offset case when ids is null and codes is null then (page-1)*50 else 0 end) x;
   return result;
 elsif p_action='list' then
   select jsonb_build_object('items',coalesce(jsonb_agg(x.item order by x.updated_at desc,x.id),'[]'::jsonb),'total',(select count(*) from pricing_documents a where a.company_id=p_company and (a.kind='sheet' or a.owner_key=p_actor) and (q='' or strpos(lower(a.content->>'title'),lower(q))>0))) into result
   from (select a.id,a.updated_at,jsonb_build_object('id',a.id,'revision',a.revision,'content',a.content,'updatedAt',a.updated_at) item from pricing_documents a where a.company_id=p_company and (a.kind='sheet' or a.owner_key=p_actor) and (q='' or strpos(lower(a.content->>'title'),lower(q))>0) order by a.updated_at desc,a.id limit 50 offset (page-1)*50) x;
   return result;
 elsif p_action='versions' then
   select * into d from pricing_documents a where a.company_id=p_company and a.id=v_id and (a.kind='sheet' or a.owner_key=p_actor);
   if not found then raise exception 'Document not found'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'documentId',x.document_id,'version',x.version,'revision',x.revision,'content',x.content,'publishedAt',x.published_at,'promotionStock',coalesce((select jsonb_object_agg(p.id::text,p.stock) from pricing_promotions p where p.company_id=p_company and exists(select from jsonb_array_elements(x.content->'lines') l where l->>'promotionId'=p.id::text)),'{}'::jsonb),'unavailablePromotions',coalesce((select jsonb_agg(l->>'promotionId') from jsonb_array_elements(x.content->'lines') l where l->>'promotionId' is not null and not exists(select from pricing_promotions p where p.company_id=p_company and p.id=(l->>'promotionId')::uuid and today between p.starts_on and p.ends_on and p.stock is distinct from 0)),'[]'::jsonb)) order by x.version desc),'[]'::jsonb) into result from (select * from pricing_document_versions a where a.company_id=p_company and a.document_id=v_id order by a.version desc limit 50 offset (page-1)*50) x;
   return result;
 elsif p_action='promotions' then
   select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'productId',p.product_id,'name',case when p_manager then p.name else p.display_name end,'displayName',p.display_name,'startsOn',p.starts_on,'endsOn',p.ends_on,'price',p.price,'stock',p.stock,'perStoreLimit',p.per_store_limit,'allowSheet',p.allow_sheet,'badge',p.badge,'taxType',p.tax_type,'revision',p.revision) || case when p_manager then jsonb_build_object('cost',p.purchase_cost,'regularCost',c.purchase_price,'margin',p.margin_bp/100.0) else '{}'::jsonb end order by p.ends_on,p.id),'[]'::jsonb) into result from pricing_promotions p join product_catalog c on c.company_id=p.company_id and c.id=p.product_id where p.company_id=p_company and (p_manager or (today between p.starts_on and p.ends_on and p.stock is distinct from 0));return result;
 elsif p_action='sets' then
   select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'shared',s.shared,'productIds',s.product_ids,'revision',s.revision,'editable',case when s.shared then p_manager else s.owner_key=p_actor end) order by s.name,s.id),'[]'::jsonb) into result from pricing_product_sets s where s.company_id=p_company and (s.shared or s.owner_key=p_actor);return result;
 elsif p_action='profile' then
   select jsonb_build_object('revision',a.revision,'content',a.content) into result from pricing_print_profiles a where a.company_id=p_company;return coalesce(result,jsonb_build_object('revision',0,'content',jsonb_build_object('companyName','','contact','','footer','')));
 end if;
 -- All mutations serialize per company; quote authorship is checked after the lock.
 perform 1 from companies where companies.id=p_company for update;
 if not found or expected is null or expected<0 or v_id is null then raise exception 'Invalid write scope'; end if;
 clean:=p_payload->'content';
 if p_action in ('save','publish') then
   select * into d from pricing_documents a where a.company_id=p_company and a.id=v_id for update;
   if found and ((d.kind='quote' and d.owner_key<>p_actor) or (d.kind='sheet' and not p_manager)) then raise exception 'Document not found'; end if;
   if p_action='save' then
     clean:=pricing_p1_clean(p_company,clean);
     if clean->>'kind'='sheet' and not p_manager then raise exception 'Manager required'; end if;
     if d.id is null then
       if expected<>0 then raise exception 'Stale document'; end if;
       insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values(v_id,p_company,p_actor,clean->>'kind',1,clean) returning * into d;
     else
       if d.kind<>clean->>'kind' then raise exception 'Kind cannot change'; end if;
       if d.revision<>expected then
         if not (expected=d.revision-1 and d.content=clean) then raise exception 'Stale document'; end if;
       else update pricing_documents a set content=clean,revision=a.revision+1,updated_at=clock_timestamp() where a.company_id=p_company and a.id=v_id returning * into d; end if;
     end if;
     return jsonb_build_object('id',d.id,'revision',d.revision,'content',d.content,'updatedAt',d.updated_at);
   else
     if d.id is null or d.revision<>expected then raise exception 'Stale document'; end if;
     select * into v from pricing_document_versions a where a.company_id=p_company and a.document_id=v_id and a.revision=expected;
     if v.id is null then
       clean:=pricing_p1_clean(p_company,d.content);
       if (clean->>'validUntil')::date<today then raise exception 'Expired document'; end if;
       if not exists(select from jsonb_array_elements(clean->'lines') l where (l->>'visible')::boolean and (l->>'promotionId' is null or (today between (l->>'startsOn')::date and (l->>'endsOn')::date and (l->>'remaining')::bigint is distinct from 0))) then raise exception 'No available lines'; end if;
       select coalesce(max(a.version),0)+1 into n from pricing_document_versions a where a.company_id=p_company and a.document_id=v_id;
       insert into pricing_document_versions(company_id,document_id,version,revision,content) values(p_company,v_id,n,expected,clean) returning * into v;
     end if;
     return jsonb_build_object('id',v.id,'documentId',v.document_id,'version',v.version,'revision',v.revision,'content',v.content,'publishedAt',v.published_at,'unavailablePromotions','[]'::jsonb);
   end if;
 elsif p_action='save-promotion' then
   if not p_manager then raise exception 'Manager required'; end if;
   select * into pr from pricing_promotions a where a.company_id=p_company and a.id=v_id for update;
   if (pr.id is null and expected<>0) or (pr.id is not null and pr.revision<>expected) then raise exception 'Stale promotion'; end if;
   if not exists(select from product_catalog c where c.company_id=p_company and c.id=(clean->>'productId')::uuid and c.is_active) then raise exception 'Product not found'; end if;
   bp:=(clean->>'margin')::numeric*100;
   if bp<>trunc(bp) or length(trim(coalesce(clean->>'name',''))) not between 1 and 120 or length(trim(coalesce(clean->>'displayName',''))) not between 1 and 120 then raise exception 'Invalid promotion'; end if;
   if coalesce(clean->>'startsOn','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(clean->>'endsOn','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Promotion dates required'; end if;
   if (clean->>'cost')::numeric<>round((clean->>'cost')::numeric,2) then raise exception 'Use 2 decimal cost'; end if;
   if (clean->>'stock')::numeric<>trunc((clean->>'stock')::numeric) or (clean->>'perStoreLimit')::numeric<>trunc((clean->>'perStoreLimit')::numeric) then raise exception 'Use whole quantities'; end if;
   price:=pricing_p0_price((clean->>'cost')::numeric,bp::integer,10);
   insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision)
   values(v_id,p_company,(clean->>'productId')::uuid,trim(clean->>'name'),trim(clean->>'displayName'),(clean->>'startsOn')::date,(clean->>'endsOn')::date,(clean->>'cost')::numeric,bp,price,(clean->>'stock')::bigint,(clean->>'perStoreLimit')::bigint,clean->>'taxType',(clean->>'allowSheet')::boolean,clean->>'badge',expected+1)
   on conflict(id) do update set product_id=excluded.product_id,name=excluded.name,display_name=excluded.display_name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,purchase_cost=excluded.purchase_cost,margin_bp=excluded.margin_bp,price=excluded.price,stock=excluded.stock,per_store_limit=excluded.per_store_limit,tax_type=excluded.tax_type,allow_sheet=excluded.allow_sheet,badge=excluded.badge,revision=excluded.revision
   where pricing_promotions.company_id=p_company;
   if not found then raise exception 'Promotion not found'; end if;return jsonb_build_object('saved',true);
 elsif p_action='delete-promotion' then
   if not p_manager then raise exception 'Manager required'; end if;
   delete from pricing_promotions a where a.company_id=p_company and a.id=v_id and a.revision=expected;
   if not found then raise exception 'Stale promotion'; end if;return jsonb_build_object('saved',true);
 elsif p_action='save-set' then
   select * into st from pricing_product_sets a where a.company_id=p_company and a.id=v_id for update;
   if st.id is not null and ((st.shared and not p_manager) or (not st.shared and st.owner_key<>p_actor)) then raise exception 'Set not found'; end if;
   if (st.id is null and expected<>0) or (st.id is not null and st.revision<>expected) then raise exception 'Stale set'; end if;
   if (clean->>'shared')::boolean and not p_manager then raise exception 'Manager required'; end if;
   select array_agg(value::uuid) into ids from jsonb_array_elements_text(clean->'productIds');
   if ids is null or cardinality(ids) not between 1 and 100 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or (select count(*) from product_catalog c where c.company_id=p_company and c.id=any(ids) and c.is_active)<>cardinality(ids) or length(trim(coalesce(clean->>'name',''))) not between 1 and 100 then raise exception 'Invalid set'; end if;
   insert into pricing_product_sets(id,company_id,owner_key,name,kind,shared,product_ids,revision) values(v_id,p_company,p_actor,trim(clean->>'name'),clean->>'kind',(clean->>'shared')::boolean,ids,expected+1)
   on conflict(id) do update set owner_key=excluded.owner_key,name=excluded.name,kind=excluded.kind,shared=excluded.shared,product_ids=excluded.product_ids,revision=excluded.revision where pricing_product_sets.company_id=p_company;
   if not found then raise exception 'Set not found'; end if;return jsonb_build_object('saved',true);
 elsif p_action='delete-set' then
   delete from pricing_product_sets a where a.company_id=p_company and a.id=v_id and a.revision=expected and ((a.shared and p_manager) or (not a.shared and a.owner_key=p_actor));
   if not found then raise exception 'Stale set'; end if;return jsonb_build_object('saved',true);
 elsif p_action='save-profile' then
   if not p_manager or length(trim(coalesce(clean->>'companyName',''))) not between 1 and 100 or length(coalesce(clean->>'contact',''))>100 or length(coalesce(clean->>'footer',''))>400 then raise exception 'Invalid print profile'; end if;
   select a.revision into n from pricing_print_profiles a where a.company_id=p_company;
   if coalesce(n,0)<>expected then raise exception 'Stale profile'; end if;
   insert into pricing_print_profiles(company_id,content,revision) values(p_company,jsonb_build_object('companyName',clean->>'companyName','contact',coalesce(clean->>'contact',''),'footer',coalesce(clean->>'footer','')),expected+1)
   on conflict(company_id) do update set content=excluded.content,revision=excluded.revision;return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown P1 action';
end $$;
revoke all on function public.pricing_p1_clean(uuid,jsonb),public.pricing_p1(uuid,text,boolean,text,jsonb),public.pricing_version_immutable() from public,anon,authenticated,service_role;
grant execute on function public.pricing_p1_clean(uuid,jsonb),public.pricing_p1(uuid,text,boolean,text,jsonb) to service_role;
commit;
