-- DRAFT ONLY. Never run against production. Local PostgreSQL 16 verification required.
-- Dependencies: companies; product_catalog with company_id/id unique, is_active.
-- Service-only API: company authorization is mandatory at the server boundary.
begin;
create table public.pricing_margin_groups (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80), margin_bp integer not null check(margin_bp between 0 and 9999),
 rounding integer not null default 10 check(rounding in (1,10,100)), unique(company_id,id), unique(company_id,name)
);
create table public.pricing_items (
 company_id uuid not null references public.companies(id) on delete cascade, product_id uuid not null,
 group_id uuid, price bigint not null default 0 check(price between 0 and 1000000000000),
 direct_price bigint check(direct_price between 0 and 1000000000000),
 applied_cost numeric(14,2), applied_margin_bp integer, applied_rounding integer, revision bigint not null default 0,
 primary key(company_id,product_id),
 foreign key(company_id,product_id) references public.product_catalog(company_id,id) on delete cascade,
 foreign key(company_id,group_id) references public.pricing_margin_groups(company_id,id)
);
create table public.pricing_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(), restored boolean not null default false, unique(company_id,id)
);
create table public.pricing_run_items (
 company_id uuid not null references public.companies(id) on delete cascade, run_id uuid not null, product_id uuid not null,
 before_value jsonb not null, after_value jsonb not null,
 primary key(company_id,run_id,product_id),
 foreign key(company_id,run_id) references public.pricing_runs(company_id,id) on delete cascade,
 foreign key(company_id,product_id) references public.pricing_items(company_id,product_id) on delete cascade
);
alter table public.pricing_margin_groups enable row level security;
alter table public.pricing_items enable row level security;
alter table public.pricing_runs enable row level security;
alter table public.pricing_run_items enable row level security;
revoke all on public.pricing_margin_groups,public.pricing_items,public.pricing_runs,public.pricing_run_items from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.pricing_margin_groups,public.pricing_items,public.pricing_runs,public.pricing_run_items to service_role;

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

create function public.pricing_p0_state(p_company uuid) returns jsonb language sql stable security invoker set search_path = public,pg_temp as $$
 select jsonb_build_object(
 'groups', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'margin',margin_bp/100.0,'rounding',rounding) order by name) from pricing_margin_groups where company_id=p_company),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(p.canonical_name,p.purchase_product_name),'cost',p.purchase_price,'active',p.is_active,'groupId',i.group_id,'price',coalesce(i.price,0),'directPrice',i.direct_price,'appliedCost',i.applied_cost,'appliedMargin',i.applied_margin_bp/100.0,'appliedRounding',i.applied_rounding) order by p.id) from product_catalog p left join pricing_items i on i.company_id=p.company_id and i.product_id=p.id where p.company_id=p_company),'[]'::jsonb),
 'lastBatch',(select id from pricing_runs where company_id=p_company order by created_at desc,id desc limit 1),
 'restored',coalesce((select restored from pricing_runs where company_id=p_company order by created_at desc,id desc limit 1),false)
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
     insert into pricing_margin_groups(company_id,name,margin_bp,rounding) values(p_company,trim(p_command->>'name'),bp,(p_command->>'rounding')::integer);
   else
     update pricing_margin_groups set name=trim(p_command->>'name'),margin_bp=bp,rounding=(p_command->>'rounding')::integer where company_id=p_company and id=(p_command->>'id')::uuid;
     if not found then raise exception 'Group not found'; end if;
   end if;
 elsif action in ('assign','direct') then
   insert into pricing_items(company_id,product_id) values(p_company,(p_command->>'productId')::uuid) on conflict do nothing;
   if action='assign' then
     update pricing_items set group_id=nullif(p_command->>'groupId','')::uuid,revision=revision+1 where company_id=p_company and product_id=(p_command->>'productId')::uuid;
   else
     if (p_command->>'price')::numeric <> trunc((p_command->>'price')::numeric) then raise exception 'Use integer KRW'; end if;
     update pricing_items set direct_price=(p_command->>'price')::bigint,price=coalesce((p_command->>'price')::bigint,price),applied_cost=null,revision=revision+1 where company_id=p_company and product_id=(p_command->>'productId')::uuid;
   end if;
 elsif action='recalculate' then
   -- Lock catalog rows: concurrent cost updates wait and will appear as pending next time.
   perform 1 from product_catalog where company_id=p_company order by id for update;
   for row in select i.*,p.purchase_price,g.margin_bp,g.rounding from pricing_items i join product_catalog p on p.company_id=i.company_id and p.id=i.product_id join pricing_margin_groups g on g.company_id=i.company_id and g.id=i.group_id
     where i.company_id=p_company and p.is_active and p.purchase_price>0 and i.direct_price is null
     and (i.applied_cost is distinct from p.purchase_price or i.applied_margin_bp is distinct from g.margin_bp or i.applied_rounding is distinct from g.rounding)
     order by i.product_id for update of i
   loop
     if run is null then insert into pricing_runs(company_id) values(p_company) returning id into run; end if;
     select to_jsonb(i) into prior from pricing_items i where company_id=p_company and product_id=row.product_id;
     new_price := pricing_p0_price(row.purchase_price,row.margin_bp,row.rounding);
     update pricing_items set price=new_price,applied_cost=row.purchase_price,applied_margin_bp=row.margin_bp,applied_rounding=row.rounding,revision=revision+1 where company_id=p_company and product_id=row.product_id returning to_jsonb(pricing_items.*) into resulting;
     insert into pricing_run_items values(p_company,run,row.product_id,prior,resulting);
   end loop;
 elsif action='restore' then
   run := (p_command->>'batchId')::uuid;
   if run is null then raise exception 'Run is required'; end if;
   if run is distinct from (select id from pricing_runs where company_id=p_company order by created_at desc,id desc limit 1) then raise exception 'Only latest run can be restored'; end if;
   if (select restored from pricing_runs where company_id=p_company and id=run) then return; end if;
   for row in select * from pricing_run_items where company_id=p_company and run_id=run order by product_id loop
     select to_jsonb(i) into resulting from pricing_items i where company_id=p_company and product_id=row.product_id for update;
     if resulting is distinct from row.after_value then raise exception 'Price changed since calculation; restore cancelled'; end if;
     update pricing_items set price=(row.before_value->>'price')::bigint,applied_cost=(row.before_value->>'applied_cost')::numeric,applied_margin_bp=(row.before_value->>'applied_margin_bp')::integer,applied_rounding=(row.before_value->>'applied_rounding')::integer,revision=revision+1 where company_id=p_company and product_id=row.product_id;
   end loop;
   update pricing_runs set restored=true where company_id=p_company and id=run;
 else raise exception 'Unknown pricing action';
 end if;
end $$;
revoke all on function public.pricing_p0_price(numeric,integer,integer,bigint), public.pricing_p0_state(uuid), public.pricing_p0_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pricing_p0_price(numeric,integer,integer,bigint), public.pricing_p0_state(uuid), public.pricing_p0_command(uuid,jsonb) to service_role;
commit;
