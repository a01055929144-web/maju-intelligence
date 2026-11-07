-- REVIEW-ONLY DRAFT. Do not apply to production without project approval.
-- One RPC owns the customer rows and the terminal customer_imports state.

begin;

alter table public.customer_imports
  add column if not exists request_digest text;

create or replace function public.save_customer_import_atomic_draft(
  p_company_id uuid,
  p_import_id uuid,
  p_source text,
  p_original_filename text,
  p_quality_score integer,
  p_duplicate_count integer,
  p_customers jsonb,
  p_raw_rows jsonb default '[]'::jsonb,
  p_column_mappings jsonb default '[]'::jsonb
)
returns table(import_id uuid, status text, row_count integer, error_message text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_customer jsonb;
  v_existing public.normalized_customers%rowtype;
  v_candidate public.normalized_customers%rowtype;
  v_file_id uuid;
  v_row_count integer := jsonb_array_length(p_customers);
  v_existing_import public.customer_imports%rowtype;
  v_request_digest text;
begin
  if p_company_id is null or p_import_id is null then
    raise exception 'company_id_and_import_id_required';
  end if;
  if p_source not in ('manual-customer-master', 'customer-master', 'excel') then
    raise exception 'unsupported_customer_import_source';
  end if;
  if jsonb_typeof(p_customers) <> 'array' or v_row_count < 1 or v_row_count > 5000 then
    raise exception 'customers_must_contain_1_to_5000_rows';
  end if;
  if jsonb_typeof(p_raw_rows) <> 'array' or jsonb_typeof(p_column_mappings) <> 'array' then
    raise exception 'raw_rows_and_column_mappings_must_be_arrays';
  end if;
  if jsonb_array_length(p_raw_rows) > 5000 or jsonb_array_length(p_column_mappings) > 200 then
    raise exception 'raw_rows_or_column_mappings_limit_exceeded';
  end if;
  if octet_length(p_customers::text) + octet_length(p_raw_rows::text)
    + octet_length(p_column_mappings::text) > 26214400 then
    raise exception 'customer_import_payload_too_large';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company_not_found';
  end if;

  v_request_digest := encode(extensions.digest(
    p_company_id::text || E'\n' || p_import_id::text || E'\n' || p_source || E'\n'
    || coalesce(p_original_filename, '') || E'\n' || coalesce(p_quality_score, 0)::text || E'\n'
    || coalesce(p_duplicate_count, 0)::text || E'\n' || p_customers::text || E'\n'
    || p_raw_rows::text || E'\n' || p_column_mappings::text,
    'sha256'
  ), 'hex');

  -- The same client-generated import ID is one operation, including concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(p_import_id::text, 0));

  select * into v_existing_import
  from public.customer_imports
  where id = p_import_id
  for update;

  if found then
    if v_existing_import.company_id <> p_company_id then
      raise exception 'import_company_mismatch';
    end if;
    if v_existing_import.request_digest is distinct from v_request_digest then
      raise exception 'import_request_digest_mismatch';
    end if;
    if v_existing_import.status in ('completed', 'failed') then
      return query select v_existing_import.id, v_existing_import.status,
        v_existing_import.row_count, v_existing_import.error_message;
      return;
    end if;
    raise exception 'import_already_processing';
  end if;

  insert into public.uploaded_files(company_id, original_filename, status)
  values (p_company_id, coalesce(nullif(btrim(p_original_filename), ''), p_source), 'processed')
  returning id into v_file_id;

  insert into public.customer_imports(
    id, company_id, uploaded_file_id, source, row_count, status, request_digest,
    quality_score, duplicate_count, completed_at, error_message
  ) values (
    p_import_id, p_company_id, v_file_id, p_source, v_row_count, 'processing', v_request_digest,
    greatest(0, least(100, coalesce(p_quality_score, 0))),
    greatest(0, coalesce(p_duplicate_count, 0)), null, null
  );

  begin
    insert into public.raw_customer_rows(company_id, import_id, row_index, raw_data)
    select p_company_id, p_import_id, ordinal::integer, value
    from jsonb_array_elements(p_raw_rows) with ordinality as raw_row(value, ordinal);

    insert into public.column_mappings(company_id, import_id, source_header, target_field, confidence)
    select
      p_company_id,
      p_import_id,
      nullif(btrim(value ->> 'source_header'), ''),
      nullif(btrim(value ->> 'target_field'), ''),
      greatest(0, least(100, coalesce((value ->> 'confidence')::integer, 100)))
    from jsonb_array_elements(p_column_mappings);

    for v_customer in select value from jsonb_array_elements(p_customers)
    loop
      if jsonb_typeof(v_customer) <> 'object'
        or nullif(btrim(v_customer ->> 'customer_name'), '') is null
        or nullif(btrim(v_customer ->> 'normalized_key'), '') is null then
        raise exception 'customer_name_and_normalized_key_required';
      end if;
      if exists (
        select 1 from jsonb_object_keys(v_customer) key
        where key not in (
          'customer_name', 'business_registration_number', 'representative_name',
          'opening_date', 'region', 'address', 'phone', 'email', 'birth_date',
          'industry', 'grade_override', 'monthly_revenue', 'last_order_days',
          'visit_count', 'delivery_km', 'delivery_minutes', 'delivery_manager',
          'delivery_zone', 'loading_position', 'access_method_type', 'access_note',
          'access_password', 'business_status', 'business_status_checked_at',
          'business_license_file_url', 'bank_account_file_url', 'naver_place_url',
          'kakao_place_url', 'google_map_url', 'place_links_checked_at',
          'normalized_key', 'duplicate_of', 'business_hours', 'menu_summary',
          'delivery_vehicle', 'review_summary', 'review_keywords', 'review_source',
          'reviews_updated_at', 'relationship_status', 'relationship_status_updated_at',
          'relationship_status_note', 'assigned_staff_member_id',
          'delivery_vehicle_id', 'delivery_territory_id'
        )
      ) then
        raise exception 'unsupported_customer_field';
      end if;

      select * into v_existing
      from public.normalized_customers
      where company_id = p_company_id
        and normalized_key = btrim(v_customer ->> 'normalized_key')
      for update;

      if found then
        v_candidate := jsonb_populate_record(v_existing, v_customer);
        v_candidate.id := v_existing.id;
        v_candidate.company_id := p_company_id;
        v_candidate.import_id := p_import_id;
        v_candidate.created_at := v_existing.created_at;
        v_candidate.normalized_key := btrim(v_customer ->> 'normalized_key');

        update public.normalized_customers set
          import_id = v_candidate.import_id,
          customer_name = v_candidate.customer_name,
          business_registration_number = v_candidate.business_registration_number,
          representative_name = v_candidate.representative_name,
          opening_date = v_candidate.opening_date,
          region = v_candidate.region,
          address = v_candidate.address,
          phone = v_candidate.phone,
          email = v_candidate.email,
          birth_date = v_candidate.birth_date,
          industry = v_candidate.industry,
          grade_override = v_candidate.grade_override,
          monthly_revenue = v_candidate.monthly_revenue,
          last_order_days = v_candidate.last_order_days,
          visit_count = v_candidate.visit_count,
          delivery_km = v_candidate.delivery_km,
          delivery_minutes = v_candidate.delivery_minutes,
          delivery_manager = v_candidate.delivery_manager,
          delivery_zone = v_candidate.delivery_zone,
          loading_position = v_candidate.loading_position,
          access_method_type = v_candidate.access_method_type,
          access_note = v_candidate.access_note,
          access_password = v_candidate.access_password,
          business_status = v_candidate.business_status,
          business_status_checked_at = v_candidate.business_status_checked_at,
          business_license_file_url = v_candidate.business_license_file_url,
          bank_account_file_url = v_candidate.bank_account_file_url,
          naver_place_url = v_candidate.naver_place_url,
          kakao_place_url = v_candidate.kakao_place_url,
          google_map_url = v_candidate.google_map_url,
          place_links_checked_at = v_candidate.place_links_checked_at,
          normalized_key = v_candidate.normalized_key,
          duplicate_of = v_candidate.duplicate_of,
          business_hours = v_candidate.business_hours,
          menu_summary = v_candidate.menu_summary,
          delivery_vehicle = v_candidate.delivery_vehicle,
          review_summary = v_candidate.review_summary,
          review_keywords = v_candidate.review_keywords,
          review_source = v_candidate.review_source,
          reviews_updated_at = v_candidate.reviews_updated_at,
          relationship_status = v_candidate.relationship_status,
          relationship_status_updated_at = v_candidate.relationship_status_updated_at,
          relationship_status_note = v_candidate.relationship_status_note,
          assigned_staff_member_id = v_candidate.assigned_staff_member_id,
          delivery_vehicle_id = v_candidate.delivery_vehicle_id,
          delivery_territory_id = v_candidate.delivery_territory_id
        where id = v_existing.id;
      else
        v_candidate := jsonb_populate_record(null::public.normalized_customers, v_customer);
        v_candidate.id := gen_random_uuid();
        v_candidate.company_id := p_company_id;
        v_candidate.import_id := p_import_id;
        v_candidate.customer_name := btrim(v_customer ->> 'customer_name');
        v_candidate.normalized_key := btrim(v_customer ->> 'normalized_key');
        v_candidate.monthly_revenue := coalesce(v_candidate.monthly_revenue, 0);
        v_candidate.last_order_days := coalesce(v_candidate.last_order_days, 0);
        v_candidate.visit_count := coalesce(v_candidate.visit_count, 0);
        v_candidate.delivery_km := coalesce(v_candidate.delivery_km, 0);
        v_candidate.review_keywords := coalesce(v_candidate.review_keywords, '{}'::text[]);
        v_candidate.created_at := clock_timestamp();
        insert into public.normalized_customers select (v_candidate).*;
      end if;
    end loop;

    update public.customer_imports
    set status = 'completed', completed_at = clock_timestamp(), error_message = null
    where id = p_import_id;
  exception when others then
    update public.customer_imports
    set status = 'failed', completed_at = clock_timestamp(),
      error_message = 'customer_import_failed:' || sqlstate
    where id = p_import_id;
  end;

  return query
  select item.id, item.status, item.row_count, item.error_message
  from public.customer_imports item
  where item.id = p_import_id;
end;
$$;

revoke all on function public.save_customer_import_atomic_draft(
  uuid, uuid, text, text, integer, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.save_customer_import_atomic_draft(
  uuid, uuid, text, text, integer, integer, jsonb, jsonb, jsonb
) to service_role;

commit;
