-- DRAFT ONLY. Depends on pending-delivery-order SQL; no operating application approval.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
create table public.store_order_delivery_resolutions_09(
  id uuid primary key default gen_random_uuid(),company_id uuid not null,order_id uuid not null,
  request_id uuid not null,actor_member_id uuid not null,actor_user_id uuid not null,delivery_date date,action text not null check(action in ('confirm','cancel')),
  before_revision integer not null,after_revision integer not null,confirmed_at timestamptz not null default clock_timestamp(),
  unique(company_id,request_id),unique(company_id,order_id,after_revision),
  check(after_revision=before_revision+1 and before_revision>0),check((action='confirm')=(delivery_date is not null)),
  foreign key(company_id,order_id) references public.store_orders(company_id,id),
  foreign key(company_id,actor_member_id) references public.company_members(company_id,id)
);
alter table public.store_order_delivery_resolutions_09 enable row level security;
revoke all on public.store_order_delivery_resolutions_09 from public,anon,authenticated,service_role;
grant select,insert on public.store_order_delivery_resolutions_09 to service_role;
create function public.resolve_pending_order_delivery_09(
  p_company_id uuid,p_order_id uuid,p_actor_member_id uuid,p_actor_user_id uuid,
  p_request_id uuid,p_expected_revision integer,p_delivery_date date,p_action text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.store_orders%rowtype; previous public.store_order_delivery_resolutions_09%rowtype;
  weekdays smallint[]; days smallint; cutoff time; territory uuid; company_configured boolean;
begin
  perform 1 from public.company_members m join public.app_users u on u.id=m.user_id
    where m.company_id=p_company_id and m.id=p_actor_member_id and m.user_id=p_actor_user_id and u.status='active'
    and m.status='active' and coalesce(m.permission_role,m.role) in ('owner','manager')
    and (m.membership_expires_at is null or m.membership_expires_at>clock_timestamp()) for share of m,u;
  if not found then raise exception 'pending_confirmation_manager_required'; end if;
  if p_request_id is null or p_order_id is null or p_expected_revision is null or p_expected_revision<1 or p_action is null or p_action not in ('confirm','cancel') or (p_action='confirm' and p_delivery_date is null) or (p_action='cancel' and p_delivery_date is not null)
    then raise exception 'pending_confirmation_invalid'; end if;
  select * into o from public.store_orders where company_id=p_company_id and id=p_order_id for update;
  if not found then raise exception 'pending_confirmation_order_unavailable'; end if;
  select * into previous from public.store_order_delivery_resolutions_09 where company_id=p_company_id and request_id=p_request_id;
  if found then
    if previous.order_id<>p_order_id or previous.actor_member_id<>p_actor_member_id or previous.actor_user_id<>p_actor_user_id
      or previous.delivery_date is distinct from p_delivery_date or previous.action<>p_action or previous.before_revision<>p_expected_revision then raise exception 'pending_confirmation_key_conflict'; end if;
    return jsonb_build_object('id',previous.order_id,'deliveryDate',previous.delivery_date,'revision',previous.after_revision,'action',previous.action);
  end if;
  if o.delivery_confirmation<>'pending' or o.delivery_date is not null or o.status not in ('submitted','received')
    or o.revision<>p_expected_revision then raise exception 'pending_confirmation_revision_conflict'; end if;
  if p_action='confirm' then
  if p_delivery_date<(clock_timestamp() at time zone 'Asia/Seoul')::date
    or p_delivery_date>(clock_timestamp() at time zone 'Asia/Seoul')::date+366 then raise exception 'pending_confirmation_date_invalid'; end if;
  select delivery_territory_id into territory from public.normalized_customers where company_id=p_company_id and id=o.customer_id;
  select exists(select 1 from public.store_order_settings where company_id=p_company_id) into company_configured;
  select coalesce(c.delivery_weekdays,t.delivery_weekdays),coalesce(c.cutoff_days_before,t.cutoff_days_before,s.cutoff_days_before),
    coalesce(c.cutoff_time,t.cutoff_time,s.cutoff_time) into weekdays,days,cutoff
    from (select 1) seed left join public.store_order_customer_rules c on c.company_id=p_company_id and c.customer_id=o.customer_id
    left join public.store_order_territory_rules t on t.company_id=p_company_id and t.territory_id=territory
    left join public.store_order_settings s on s.company_id=p_company_id;
  if company_configured and weekdays is not null and (not extract(dow from p_delivery_date)::smallint=any(weekdays)
    or (clock_timestamp() at time zone 'Asia/Seoul')>=(p_delivery_date-days)::timestamp+cutoff
    or exists(select 1 from public.store_order_holidays h where h.company_id=p_company_id and (h.territory_id is null or h.territory_id=territory)
      and ((h.kind='weekly' and h.weekday=extract(dow from p_delivery_date)) or (h.kind='fixed' and h.month=extract(month from p_delivery_date) and h.day=extract(day from p_delivery_date))
        or (h.kind='date' and h.holiday_date=p_delivery_date)))) then raise exception 'pending_confirmation_date_unavailable'; end if;
  update public.store_orders set delivery_date=p_delivery_date,delivery_confirmation='scheduled',revision=revision+1,updated_at=clock_timestamp()
    where company_id=p_company_id and id=o.id returning * into o;
  else
    update public.store_orders set status='cancelled',revision=revision+1,updated_at=clock_timestamp() where company_id=p_company_id and id=o.id returning * into o;
  end if;
  insert into public.store_order_delivery_resolutions_09(company_id,order_id,request_id,actor_member_id,actor_user_id,delivery_date,before_revision,after_revision,action)
    values(p_company_id,o.id,p_request_id,p_actor_member_id,p_actor_user_id,p_delivery_date,p_expected_revision,o.revision,p_action);
  return jsonb_build_object('id',o.id,'deliveryDate',o.delivery_date,'revision',o.revision,'action',p_action);
end $$;
revoke all on function public.resolve_pending_order_delivery_09(uuid,uuid,uuid,uuid,uuid,integer,date,text) from public,anon,authenticated;
grant execute on function public.resolve_pending_order_delivery_09(uuid,uuid,uuid,uuid,uuid,integer,date,text) to service_role;
notify pgrst,'reload schema';
commit;
