-- DRAFT ONLY. Operating DB approval is required before application.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.normalized_customers') is null
    or to_regclass('public.admin_audit_logs') is null then
    raise exception 'customer_manual_coordinate_prerequisites_required';
  end if;
end $$;

create or replace function public.set_customer_manual_coordinate_atomic(
  p_company_id uuid,
  p_customer_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_actor_user_id uuid,
  p_actor_name text,
  p_request_key text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  before_row public.normalized_customers%rowtype;
  prior_audit_id uuid;
begin
  if p_latitude is null or p_latitude < 33 or p_latitude > 39
    or p_longitude is null or p_longitude < 124 or p_longitude > 132 then
    raise exception 'invalid_korean_coordinate';
  end if;
  if nullif(btrim(p_actor_name), '') is null
    or nullif(btrim(p_request_key), '') is null
    or char_length(btrim(p_request_key)) > 120 then
    raise exception 'actor_and_request_key_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-manual-coordinate:' || p_company_id || ':' || p_customer_id, 0));
  select * into before_row
    from public.normalized_customers
    where id = p_customer_id and company_id = p_company_id
    for update;
  if not found then raise exception 'customer_not_found'; end if;

  select id into prior_audit_id
    from public.admin_audit_logs
    where company_id = p_company_id
      and target_id = p_customer_id
      and action = 'customer_manual_coordinate_changed'
      and metadata->>'requestKey' = btrim(p_request_key)
    order by created_at desc
    limit 1;
  if prior_audit_id is not null then
    return jsonb_build_object(
      'alreadyApplied', true,
      'customerId', p_customer_id,
      'geocodeAccuracy', before_row.geocode_accuracy,
      'lat', before_row.latitude,
      'lng', before_row.longitude
    );
  end if;

  update public.normalized_customers
    set latitude = p_latitude,
        longitude = p_longitude,
        geocode_accuracy = 'manual',
        geocoded_address = null,
        geocoded_at = now(),
        updated_at = now()
    where id = p_customer_id and company_id = p_company_id;

  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values(
    p_actor_user_id,
    p_company_id,
    'customer_manual_coordinate_changed',
    'normalized_customer',
    p_customer_id,
    jsonb_build_object(
      'requestKey', btrim(p_request_key),
      'actorName', btrim(p_actor_name),
      'before', jsonb_build_object(
        'lat', before_row.latitude,
        'lng', before_row.longitude,
        'geocodeAccuracy', before_row.geocode_accuracy
      ),
      'after', jsonb_build_object(
        'lat', p_latitude,
        'lng', p_longitude,
        'geocodeAccuracy', 'manual'
      )
    )
  );

  return jsonb_build_object(
    'alreadyApplied', false,
    'customerId', p_customer_id,
    'geocodeAccuracy', 'manual',
    'lat', p_latitude,
    'lng', p_longitude
  );
end $$;

revoke all on function public.set_customer_manual_coordinate_atomic(uuid, uuid, double precision, double precision, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_customer_manual_coordinate_atomic(uuid, uuid, double precision, double precision, uuid, text, text)
  to service_role;

comment on function public.set_customer_manual_coordinate_atomic(uuid, uuid, double precision, double precision, uuid, text, text) is
  'CX-111 service-only atomic manual customer coordinate update and audit.';

notify pgrst, 'reload schema';
commit;
