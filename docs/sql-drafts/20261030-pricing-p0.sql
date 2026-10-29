-- DRAFT ONLY. Never run against production. Local PostgreSQL 16 verification required.
-- One-time draft for a fresh local test DB; NOT a rerunnable migration/upgrade script.
-- Older draft already applied? Use a new disposable DB and apply the full current draft once.
-- Recalculate/restore command retries are idempotent; DDL replay is not.
-- Dependencies: companies; product_catalog with company_id/id unique, is_active/category.
-- Service-only API: company authorization is mandatory at the server boundary.
begin;
create table public.margin_groups (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80), margin_bp integer not null check(margin_bp between 0 and 9999),
 rounding integer not null default 10 check(rounding in (1,10,100)), unique(company_id,id), unique(company_id,name)
);
create table public.margin_group_categories (
 company_id uuid not null references public.companies(id) on delete cascade,
 category text not null check(length(trim(category)) between 1 and 100), group_id uuid not null,
 primary key(company_id,category),
 foreign key(company_id,group_id) references public.margin_groups(company_id,id)
);
create table public.pricing_settings (
 company_id uuid primary key references public.companies(id) on delete cascade,
 default_margin_bp integer not null default 0 check(default_margin_bp between 0 and 9999),
 rounding integer not null default 10 check(rounding in (1,10,100))
);
alter table public.margin_group_categories enable row level security;
alter table public.pricing_settings enable row level security;
revoke all on public.margin_group_categories,public.pricing_settings from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.margin_group_categories,public.pricing_settings to service_role;

create table public.pricing_items (
 company_id uuid not null references public.companies(id) on delete cascade, product_id uuid not null,
 margin_bp integer check(margin_bp between 0 and 9999), group_id uuid, price bigint not null default 0 check(price between 0 and 1000000000000),
 direct_price bigint check(direct_price between 0 and 1000000000000),
 -- Cost-only exception: existing product_catalog.purchase_price is numeric(14,2).
 -- Preserve its exact source value (e.g. 800.01 -> 800.02); rounding to bigint
 -- would miss sub-KRW cost changes and repeatedly mismatch the pending check.
 -- This is a calculation-basis snapshot, not the payable selling/direct price.
 applied_cost numeric(14,2), applied_margin_bp integer, applied_rounding integer, revision bigint not null default 0,
 primary key(company_id,product_id),
 foreign key(company_id,product_id) references public.product_catalog(company_id,id) on delete cascade,
 foreign key(company_id,group_id) references public.margin_groups(company_id,id)
);
create table public.price_recalc_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(), restored boolean not null default false, unique(company_id,id)
);
create table public.price_recalc_changes (
 company_id uuid not null references public.companies(id) on delete cascade, run_id uuid not null, product_id uuid not null,
 -- price/direct_price inside both snapshots originate from bigint KRW columns;
 -- restoration casts price back to bigint. applied_cost alone retains source decimals.
 before_value jsonb not null, after_value jsonb not null,
 primary key(company_id,run_id,product_id),
 foreign key(company_id,run_id) references public.price_recalc_runs(company_id,id) on delete cascade,
 foreign key(company_id,product_id) references public.pricing_items(company_id,product_id) on delete cascade
);
alter table public.margin_groups enable row level security;
alter table public.pricing_items enable row level security;
alter table public.price_recalc_runs enable row level security;
alter table public.price_recalc_changes enable row level security;
revoke all on public.margin_groups,public.pricing_items,public.price_recalc_runs,public.price_recalc_changes from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.margin_groups,public.pricing_items,public.price_recalc_runs,public.price_recalc_changes to service_role;

create function public.pricing_p0_price(cost numeric, bp integer, rounding integer, direct_price bigint default null)
returns bigint language plpgsql immutable set search_path = public,pg_temp as $$
declare result numeric;
begin
 if direct_price is not null then
   if direct_price < 0 or direct_price > 1000000000000 then raise exception 'Invalid direct price'; end if;
   return direct_price;
 end if;
 if cost is null or cost < 0 or cost > 1000000000000 or bp is null or bp < 0 or bp > 9999 or rounding is null or rounding not in (1,10,100) then raise exception 'Invalid price inputs'; end if;
 result := ceil(cost * 10000 / (10000-bp) / rounding) * rounding;
 if result > 1000000000000 then raise exception 'Price overflow'; end if;
 return result::bigint;
end $$;

-- Resolver shared by paginated reads, global pending counts and the locked writer.
create view public.pricing_p0_effective with (security_invoker=true) as
 select p.company_id,p.id product_id,coalesce(p.canonical_name,p.purchase_product_name) name,
 coalesce(p.category,'') category,p.purchase_price cost,p.is_active active,
 i.group_id,i.margin_bp item_margin_bp,coalesce(i.price,0) price,i.direct_price,
 i.applied_cost,i.applied_margin_bp,i.applied_rounding,
 coalesce(i.margin_bp,g.margin_bp,s.default_margin_bp,0) effective_margin_bp,
 coalesce(g.rounding,s.rounding,10) effective_rounding
 from public.product_catalog p
 left join public.pricing_items i on i.company_id=p.company_id and i.product_id=p.id
 left join public.margin_group_categories c on c.company_id=p.company_id and c.category=coalesce(p.category,'')
 left join public.margin_groups g on g.company_id=p.company_id and g.id=coalesce(i.group_id,c.group_id)
 left join public.pricing_settings s on s.company_id=p.company_id;
revoke all on public.pricing_p0_effective from public,anon,authenticated,service_role;
grant select on public.pricing_p0_effective to service_role;

create function public.pricing_p0_state(p_company uuid,p_search text default '',p_page integer default 1) returns jsonb language sql stable security invoker set search_path = public,pg_temp as $$
 with filtered as materialized (
   select * from pricing_p0_effective where company_id=p_company
   and (coalesce(p_search,'')='' or strpos(lower(name),lower(left(p_search,100)))>0 or strpos(lower(category),lower(left(p_search,100)))>0)
 ), page_items as (
   select * from filtered order by product_id limit 50 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*50
 )
 select jsonb_build_object(
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'margin',margin_bp/100.0,'rounding',rounding) order by name) from margin_groups where company_id=p_company),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'groupId',group_id) order by category) from margin_group_categories where company_id=p_company),'[]'::jsonb),
 'defaultMargin',coalesce((select default_margin_bp/100.0 from pricing_settings where company_id=p_company),0),
 'defaultRounding',coalesce((select rounding from pricing_settings where company_id=p_company),10),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',product_id,'name',name,'category',category,'cost',cost,'active',active,'groupId',group_id,'itemMargin',item_margin_bp/100.0,'price',price,'directPrice',direct_price,'appliedCost',applied_cost,'appliedMargin',applied_margin_bp/100.0,'appliedRounding',applied_rounding) order by product_id) from page_items),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',greatest(1,least(coalesce(p_page,1),100000)),'pageSize',50,
 'pendingCount',(select count(*) from pricing_p0_effective where company_id=p_company and active and cost>0 and direct_price is null and (applied_cost is distinct from cost or applied_margin_bp is distinct from effective_margin_bp or applied_rounding is distinct from effective_rounding)),
 'lastBatch',(select id from price_recalc_runs where company_id=p_company order by created_at desc,id desc limit 1),
 'restored',coalesce((select restored from price_recalc_runs where company_id=p_company order by created_at desc,id desc limit 1),false)
 );
$$;

create function public.pricing_p0_command(p_company uuid,p_command jsonb) returns void language plpgsql security invoker set search_path = public,pg_temp as $$
declare action text := p_command->>'action'; run uuid; row record; prior jsonb; resulting jsonb; new_price bigint; bp numeric;
begin
 -- Serialize all pricing writes for a company, including retries and restores.
 perform 1 from companies where id=p_company for update;
 if not found then raise exception 'Company not found'; end if;
 if action='group' then
   bp := (p_command->>'margin')::numeric * 100;
   if bp <> trunc(bp) then raise exception 'Use at most two decimal places'; end if;
   if p_command->>'id' is null then
     insert into margin_groups(company_id,name,margin_bp,rounding) values(p_company,trim(p_command->>'name'),bp,(p_command->>'rounding')::integer);
   else
     update margin_groups set name=trim(p_command->>'name'),margin_bp=bp,rounding=(p_command->>'rounding')::integer where company_id=p_company and id=(p_command->>'id')::uuid;
     if not found then raise exception 'Group not found'; end if;
   end if;
 elsif action='defaults' then
   bp := (p_command->>'margin')::numeric * 100;
   if bp <> trunc(bp) then raise exception 'Use at most two decimal places'; end if;
   insert into pricing_settings(company_id,default_margin_bp,rounding) values(p_company,bp,(p_command->>'rounding')::integer)
   on conflict(company_id) do update set default_margin_bp=excluded.default_margin_bp,rounding=excluded.rounding;
 elsif action='category' then
   if length(trim(coalesce(p_command->>'category',''))) not between 1 and 100 then raise exception 'Category required'; end if;
   if nullif(p_command->>'groupId','') is null then
     delete from margin_group_categories where company_id=p_company and category=trim(p_command->>'category');
   else
     insert into margin_group_categories(company_id,category,group_id) values(p_company,trim(p_command->>'category'),(p_command->>'groupId')::uuid)
     on conflict(company_id,category) do update set group_id=excluded.group_id;
   end if;
 elsif action in ('assign','direct','item-margin') then
   insert into pricing_items(company_id,product_id) values(p_company,(p_command->>'productId')::uuid) on conflict do nothing;
   if action='assign' then
     update pricing_items set group_id=nullif(p_command->>'groupId','')::uuid,revision=revision+1 where company_id=p_company and product_id=(p_command->>'productId')::uuid;
   elsif action='item-margin' then
     bp := (p_command->>'margin')::numeric * 100;
     if bp <> trunc(bp) then raise exception 'Use at most two decimal places'; end if;
     update pricing_items set margin_bp=bp,revision=revision+1 where company_id=p_company and product_id=(p_command->>'productId')::uuid;
   else
     if (p_command->>'price')::numeric <> trunc((p_command->>'price')::numeric) then raise exception 'Use integer KRW'; end if;
     update pricing_items set direct_price=(p_command->>'price')::bigint,price=coalesce((p_command->>'price')::bigint,price),applied_cost=null,revision=revision+1 where company_id=p_company and product_id=(p_command->>'productId')::uuid;
   end if;
 elsif action='recalculate' then
   -- Lock catalog rows: concurrent cost updates wait and will appear as pending next time.
   perform 1 from product_catalog where company_id=p_company order by id for update;
   insert into pricing_items(company_id,product_id)
     select company_id,id from product_catalog where company_id=p_company and is_active and purchase_price>0 on conflict do nothing;
   for row in select e.* from pricing_p0_effective e
     where e.company_id=p_company and e.active and e.cost>0 and e.direct_price is null
     and (e.applied_cost is distinct from e.cost or e.applied_margin_bp is distinct from e.effective_margin_bp or e.applied_rounding is distinct from e.effective_rounding)
     order by e.product_id
   loop
     if run is null then insert into price_recalc_runs(company_id) values(p_company) returning id into run; end if;
     select to_jsonb(i) into prior from pricing_items i where company_id=p_company and product_id=row.product_id;
     new_price := pricing_p0_price(row.cost,row.effective_margin_bp,row.effective_rounding);
     update pricing_items set price=new_price,applied_cost=row.cost,applied_margin_bp=row.effective_margin_bp,applied_rounding=row.effective_rounding,revision=revision+1 where company_id=p_company and product_id=row.product_id returning to_jsonb(pricing_items.*) into resulting;
     insert into price_recalc_changes values(p_company,run,row.product_id,prior,resulting);
   end loop;
 elsif action='restore' then
   run := (p_command->>'batchId')::uuid;
   if run is null then raise exception 'Run is required'; end if;
   if run is distinct from (select id from price_recalc_runs where company_id=p_company order by created_at desc,id desc limit 1) then raise exception 'Only latest run can be restored'; end if;
   if (select restored from price_recalc_runs where company_id=p_company and id=run) then return; end if;
   for row in select * from price_recalc_changes where company_id=p_company and run_id=run order by product_id loop
     select to_jsonb(i) into resulting from pricing_items i where company_id=p_company and product_id=row.product_id for update;
     if resulting is distinct from row.after_value then raise exception 'Price changed since calculation; restore cancelled'; end if;
     update pricing_items set price=(row.before_value->>'price')::bigint,applied_cost=(row.before_value->>'applied_cost')::numeric,applied_margin_bp=(row.before_value->>'applied_margin_bp')::integer,applied_rounding=(row.before_value->>'applied_rounding')::integer,revision=revision+1 where company_id=p_company and product_id=row.product_id;
   end loop;
   update price_recalc_runs set restored=true where company_id=p_company and id=run;
 else raise exception 'Unknown pricing action';
 end if;
end $$;
revoke all on function public.pricing_p0_price(numeric,integer,integer,bigint), public.pricing_p0_state(uuid,text,integer), public.pricing_p0_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pricing_p0_price(numeric,integer,integer,bigint), public.pricing_p0_state(uuid,text,integer), public.pricing_p0_command(uuid,jsonb) to service_role;
commit;
