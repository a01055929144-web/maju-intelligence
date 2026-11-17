-- CX-60 settings/approval only. CX-58 columns and S-2b functions are prerequisites.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Turn off the CX-60 rollout before running this rollback.
lock table public.company_notifications in share row exclusive mode;
do $guard$
begin
  if exists (
    select 1
    from public.company_notifications n
    cross join (values ('businessName'), ('subBusinessNumber'), ('businessEntityType')) field(key)
    where n.notification_type = 'store_profile_changed'
      and n.processed_at is null
      and n.after_values ? field.key
      and n.before_values->field.key is distinct from n.after_values->field.key
  ) then
    raise exception 'cx60_pending_business_identity_notifications';
  end if;
end $guard$;

do $patch$
declare
  definition text := pg_get_functiondef('public.update_store_profile_v1(uuid,uuid,jsonb,text)'::regprocedure);
  before_fragments text[] := array[$frag$    business_name=case when p_changes?'businessName' then nullif(btrim(p_changes->>'businessName'),'') else business_name end,
    sub_business_number=case when p_changes?'subBusinessNumber' then nullif(btrim(p_changes->>'subBusinessNumber'),'') else sub_business_number end,
    business_entity_type=case when p_changes?'businessEntityType' then nullif(btrim(p_changes->>'businessEntityType'),'') else business_entity_type end,
    updated_at=clock_timestamp()$frag$,
    $frag$'preferredDeliveryTime',v_profile.preferred_delivery_time, 'businessName',v_profile.business_name, 'subBusinessNumber',v_profile.sub_business_number, 'businessEntityType',v_profile.business_entity_type);$frag$,
    $frag$  if p_changes?'businessName' and length(btrim(coalesce(p_changes->>'businessName','')))>100
    then raise exception 'store_profile_business_name_invalid'; end if;
  if exists(select 1 from jsonb_each(p_changes) x(key,value)
    where key in ('businessName','subBusinessNumber','businessEntityType') and jsonb_typeof(value) not in ('string','null'))
    then raise exception 'store_profile_business_identity_invalid'; end if;
  if p_changes?'storeName'$frag$,
    $frag$'preferredDeliveryTime','businessName','subBusinessNumber','businessEntityType'];$frag$];
  after_fragments text[] := array[$frag$    updated_at=clock_timestamp()$frag$,
    $frag$'preferredDeliveryTime',v_profile.preferred_delivery_time);$frag$,
    $frag$  if p_changes?'storeName'$frag$,
    $frag$'preferredDeliveryTime'];$frag$];
  expected_counts integer[] := array[1,2,1,1];
  occurrences integer;
begin
  for i in 1..cardinality(before_fragments) loop
    occurrences := (length(definition)-length(replace(definition,before_fragments[i],'')))/length(before_fragments[i]);
    if occurrences <> expected_counts[i] then raise exception 'cx60_rpc_definition_changed: update_store_profile_v1(uuid,uuid,jsonb,text)'; end if;
    definition := replace(definition,before_fragments[i],after_fragments[i]);
  end loop;
  execute definition;
end $patch$;

do $patch$
declare
  definition text := pg_get_functiondef('public.confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text)'::regprocedure);
  before_fragments text[] := array[$frag$    customer_name=coalesce(nullif(btrim(customer_name),''),p.store_name),
    business_name=coalesce(nullif(btrim(business_name),''),p.business_name),
    sub_business_number=coalesce(nullif(btrim(sub_business_number),''),p.sub_business_number),
    business_entity_type=coalesce(nullif(btrim(business_entity_type),''),p.business_entity_type),$frag$];
  after_fragments text[] := array[$frag$    customer_name=coalesce(nullif(btrim(customer_name),''),p.store_name),$frag$];
  expected_counts integer[] := array[1];
  occurrences integer;
begin
  for i in 1..cardinality(before_fragments) loop
    occurrences := (length(definition)-length(replace(definition,before_fragments[i],'')))/length(before_fragments[i]);
    if occurrences <> expected_counts[i] then raise exception 'cx60_rpc_definition_changed: confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text)'; end if;
    definition := replace(definition,before_fragments[i],after_fragments[i]);
  end loop;
  execute definition;
end $patch$;

do $patch$
declare
  definition text := pg_get_functiondef('public.apply_store_profile_notification_v1(uuid,uuid,uuid,boolean)'::regprocedure);
  before_fragments text[] := array[$frag$    business_name=case when n.after_values?'businessName' and n.before_values->'businessName' is distinct from n.after_values->'businessName' then nullif(btrim(n.after_values->>'businessName'),'') else business_name end,
    sub_business_number=case when n.after_values?'subBusinessNumber' and n.before_values->'subBusinessNumber' is distinct from n.after_values->'subBusinessNumber' then nullif(btrim(n.after_values->>'subBusinessNumber'),'') else sub_business_number end,
    business_entity_type=case when n.after_values?'businessEntityType' and n.before_values->'businessEntityType' is distinct from n.after_values->'businessEntityType' then nullif(btrim(n.after_values->>'businessEntityType'),'') else business_entity_type end,
    customer_name=case when p_apply_store_name$frag$,
    $frag$  -- The latest snapshot includes earlier values, but its own before snapshot
  -- only covers its immediate predecessor. Recover each pending field baseline.
  select n.before_values || coalesce(jsonb_object_agg(first_change.key, first_change.value),'{}'::jsonb)
    into n.before_values
  from (
    select distinct on (prior.key) prior.key,prior.value
    from public.company_notifications older
    cross join lateral jsonb_each(older.before_values) prior(key,value)
    where older.company_id=p_company and older.store_account_id=n.store_account_id
      and older.customer_id=n.customer_id and older.notification_type='store_profile_changed'
      and older.processed_at is null and (older.created_at,older.id)<(n.created_at,n.id)
      and older.after_values?prior.key and n.after_values?prior.key
      and prior.value is distinct from older.after_values->prior.key
    order by prior.key,older.created_at,older.id
  ) first_change;
  update public.normalized_customers set$frag$];
  after_fragments text[] := array[$frag$    customer_name=case when p_apply_store_name$frag$,
    $frag$  update public.normalized_customers set$frag$];
  expected_counts integer[] := array[1,1];
  occurrences integer;
begin
  for i in 1..cardinality(before_fragments) loop
    occurrences := (length(definition)-length(replace(definition,before_fragments[i],'')))/length(before_fragments[i]);
    if occurrences <> expected_counts[i] then raise exception 'cx60_rpc_definition_changed: apply_store_profile_notification_v1(uuid,uuid,uuid,boolean)'; end if;
    definition := replace(definition,before_fragments[i],after_fragments[i]);
  end loop;
  execute definition;
end $patch$;

notify pgrst, 'reload schema';
commit;
