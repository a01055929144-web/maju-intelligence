-- CX-46c DRAFT ONLY. Representative approval is required before production use.
-- Keeps route_plan_confirmations.customer_ids intact for the legacy driver screen.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
declare required_table text;
begin
  foreach required_table in array array[
    'companies', 'normalized_customers', 'business_permit_leads',
    'route_plan_confirmations', 'company_members', 'delivery_vehicle_master',
    'store_orders', 'business_documents', 'company_message_templates',
    'driver_message_templates'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'CX-46c prerequisite missing: %', required_table;
    end if;
  end loop;
end $$;

do $$ begin
  if exists (
    select 1 from public.route_plan_confirmations r
    cross join lateral jsonb_array_elements_text(r.customer_ids) value
    left join public.normalized_customers c
      on c.company_id=r.company_id and c.id::text=value
    where jsonb_typeof(r.customer_ids)<>'array' or c.id is null
  ) then raise exception 'CX-46c backfill refused: invalid or cross-company customer_ids'; end if;
end $$;

alter table public.route_plan_confirmations
  add constraint route_plan_confirmations_company_id_id_uq unique(company_id,id);
alter table public.delivery_vehicle_master
  add constraint delivery_vehicle_master_company_id_id_uq unique(company_id,id);

create table public.delivery_route_reason_codes(
  code text primary key check(code ~ '^[a-z][a-z0-9_]{1,39}$'),
  category text not null check(category in('partial','problem','not_delivered')),
  label text not null check(nullif(btrim(label),'') is not null),
  lead_status_effect text check(lead_status_effect in('제외','거절')),
  retry_next_route boolean not null default false,
  sort_order integer not null check(sort_order>=0),
  unique(category,code)
);
insert into public.delivery_route_reason_codes(code,category,label,lead_status_effect,retry_next_route,sort_order) values
 ('quantity_short','partial','수량 부족',null,false,10),
 ('item_missing','partial','품목 누락',null,false,20),
 ('item_damaged','partial','일부 파손',null,false,30),
 ('damaged','problem','파손',null,false,110),
 ('absent','problem','부재',null,true,120),
 ('return_requested','problem','반품 요청',null,false,130),
 ('access_blocked','problem','출입 불가',null,true,140),
 ('other_problem','problem','기타 문제',null,false,190),
 ('closed','not_delivered','문이 닫혀 있음',null,true,210),
 ('moved_or_closed','not_delivered','폐업·이전함','제외',false,220),
 ('refused','not_delivered','받지 않음','거절',false,230),
 ('no_time','not_delivered','시간이 없어 못 들름',null,true,240);

create table public.delivery_route_stops(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_plan_confirmation_id uuid,
  route_date date not null,
  driver_member_id uuid,
  driver_name_snapshot text not null check(nullif(btrim(driver_name_snapshot),'') is not null),
  vehicle_id uuid,
  stop_order integer not null check(stop_order>0),
  stop_type text not null check(stop_type in('delivery','sales')),
  customer_id uuid,
  lead_id uuid,
  order_id uuid,
  document_id uuid,
  status text not null default 'planned'
    check(status in('planned','arrived','completed','partial','problem','not_delivered')),
  arrived_at timestamptz,
  arrived_latitude double precision,
  arrived_longitude double precision,
  completed_at timestamptz,
  completed_latitude double precision,
  completed_longitude double precision,
  reason_code text,
  reason_category text generated always as (
    case when status='partial' then 'partial'
         when status='problem' then 'problem'
         when status='not_delivered' then 'not_delivered' end
  ) stored,
  reason_detail text check(reason_detail is null or length(reason_detail)<=500),
  handed_to_owner boolean,
  source text not null default 'manual' check(source in('legacy_customer_ids','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_route_stops_company_id_id_uq unique(company_id,id),
  constraint delivery_route_stops_driver_order_uq
    unique(company_id,route_date,driver_member_id,stop_order)
    deferrable initially deferred,
  foreign key(company_id,route_plan_confirmation_id)
    references public.route_plan_confirmations(company_id,id) on delete restrict,
  foreign key(company_id,driver_member_id)
    references public.company_members(company_id,id) on delete restrict,
  foreign key(company_id,vehicle_id)
    references public.delivery_vehicle_master(company_id,id) on delete set null(vehicle_id),
  foreign key(company_id,customer_id)
    references public.normalized_customers(company_id,id) on delete restrict,
  foreign key(company_id,lead_id)
    references public.business_permit_leads(company_id,id) on delete restrict,
  foreign key(company_id,order_id)
    references public.store_orders(company_id,id) on delete restrict,
  foreign key(company_id,document_id)
    references public.business_documents(company_id,id) on delete restrict,
  foreign key(reason_category,reason_code)
    references public.delivery_route_reason_codes(category,code),
  check((stop_type='delivery' and customer_id is not null and lead_id is null)
     or (stop_type='sales' and customer_id is null and lead_id is not null)),
  check(stop_type='delivery' or (order_id is null and document_id is null)),
  check((arrived_latitude is null)=(arrived_longitude is null)
    and (arrived_latitude is null or arrived_latitude between -90 and 90)
    and (arrived_longitude is null or arrived_longitude between -180 and 180)),
  check((completed_latitude is null)=(completed_longitude is null)
    and (completed_latitude is null or completed_latitude between -90 and 90)
    and (completed_longitude is null or completed_longitude between -180 and 180)),
  check(completed_at is null or arrived_at is null or completed_at>=arrived_at),
  check((status='planned' and arrived_at is null and completed_at is null)
     or (status='arrived' and arrived_at is not null and completed_at is null)
     or (status in('completed','partial','problem') and arrived_at is not null and completed_at is not null)
     or status='not_delivered'),
  check((status in('partial','problem','not_delivered'))=(reason_code is not null)),
  check(handed_to_owner is null or stop_type='sales'),
  check(driver_member_id is not null or source='legacy_customer_ids')
);
create index delivery_route_stops_route_idx
  on public.delivery_route_stops(company_id,route_date,driver_member_id,stop_order);
create index delivery_route_stops_customer_idx
  on public.delivery_route_stops(company_id,customer_id,route_date desc) where customer_id is not null;
create index delivery_route_stops_lead_idx
  on public.delivery_route_stops(company_id,lead_id,route_date desc) where lead_id is not null;

create table public.delivery_route_stop_photos(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stop_id uuid not null,
  order_id uuid,
  document_id uuid,
  storage_path text not null check(nullif(btrim(storage_path),'') is not null),
  mime_type text not null check(mime_type in('image/jpeg','image/png','image/webp')),
  size_bytes bigint check(size_bytes is null or size_bytes between 1 and 52428800),
  sort_order smallint not null check(sort_order between 1 and 5),
  captured_at timestamptz not null default now(),
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id,stop_id,sort_order),
  unique(company_id,storage_path),
  foreign key(company_id,stop_id) references public.delivery_route_stops(company_id,id) on delete restrict,
  foreign key(company_id,order_id) references public.store_orders(company_id,id) on delete restrict,
  foreign key(company_id,document_id) references public.business_documents(company_id,id) on delete restrict
);

insert into public.delivery_route_stops(
 company_id,route_plan_confirmation_id,route_date,driver_name_snapshot,
 stop_order,stop_type,customer_id,source,created_at,updated_at)
select r.company_id,r.id,r.route_date,r.driver_name,item.ordinality::integer,
 'delivery',c.id,'legacy_customer_ids',r.created_at,r.updated_at
from public.route_plan_confirmations r
cross join lateral jsonb_array_elements_text(r.customer_ids)
 with ordinality as item(customer_id,ordinality)
join public.normalized_customers c
 on c.company_id=r.company_id and c.id::text=item.customer_id;

alter table public.delivery_route_stops enable row level security;
alter table public.delivery_route_stop_photos enable row level security;
alter table public.delivery_route_reason_codes enable row level security;
revoke all on public.delivery_route_stops from public,anon,authenticated,service_role;
revoke all on public.delivery_route_stop_photos from public,anon,authenticated,service_role;
revoke all on public.delivery_route_reason_codes from public,anon,authenticated,service_role;
grant select,insert,update on public.delivery_route_stops to service_role;
grant select,insert on public.delivery_route_stop_photos to service_role;
grant select on public.delivery_route_reason_codes to service_role;

comment on table public.delivery_route_stops is
 'CX-46 route stops; legacy customer_ids remain and are copied once on apply.';
comment on table public.delivery_route_stop_photos is
 'Private stop photos with optional order and sales-document links; maximum five per stop.';
comment on table public.driver_message_templates is
 'Existing per-driver server-side message overrides reused by CX-46b/c.';
commit;
