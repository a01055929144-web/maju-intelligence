-- REVIEW-ONLY DRAFT. 운영 적용 금지.
-- 수기 거래처 저장과 uploaded_files/customer_imports 종결 상태를 한 트랜잭션으로 묶는다.
-- 기존 save_customer_import_atomic_draft는 expectedUpdatedAt 계약이 없어 재사용하지 않는다.

begin;

alter table public.normalized_customers
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.save_customer_manual_atomic_draft(
  p_company_id uuid,
  p_import_id uuid,
  p_customer jsonb,
  p_customer_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns table(import_id uuid, status text, conflict boolean, customer jsonb, error_message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.normalized_customers%rowtype;
  v_existing public.normalized_customers%rowtype;
  v_file_id uuid;
  v_saved public.normalized_customers%rowtype;
begin
  if p_company_id is null or p_import_id is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'company_import_and_customer_required';
  end if;
  if nullif(btrim(p_customer ->> 'customer_name'), '') is null
    or nullif(btrim(p_customer ->> 'normalized_key'), '') is null then
    raise exception 'customer_name_and_normalized_key_required';
  end if;
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'company_not_found';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_customer) key
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
      'delivery_vehicle_id', 'delivery_territory_id', 'updated_at'
    )
  ) then
    raise exception 'unsupported_customer_field';
  end if;

  insert into public.uploaded_files(company_id, original_filename, status)
  values (p_company_id, 'manual-customer-master', 'processed')
  returning id into v_file_id;

  insert into public.customer_imports(
    id, company_id, uploaded_file_id, source, row_count, status,
    quality_score, duplicate_count, completed_at, error_message
  ) values (
    p_import_id, p_company_id, v_file_id, 'manual-customer-master', 1, 'processing',
    100, 0, null, null
  );

  begin
    if p_customer_id is not null then
      select * into v_existing
      from public.normalized_customers
      where id = p_customer_id and company_id = p_company_id
      for update;
      if not found then raise exception 'customer_not_found_in_company'; end if;
    else
      select * into v_existing
      from public.normalized_customers
      where company_id = p_company_id
        and normalized_key = btrim(p_customer ->> 'normalized_key')
      for update;
    end if;

    if found and p_expected_updated_at is not null
      and v_existing.updated_at is distinct from p_expected_updated_at then
      update public.customer_imports
      set status = 'failed', completed_at = clock_timestamp(), error_message = 'customer_conflict'
      where id = p_import_id and company_id = p_company_id;
      return query select p_import_id, 'failed'::text, true, null::jsonb, 'customer_conflict'::text;
      return;
    end if;

    if found then
      v_candidate := jsonb_populate_record(v_existing, p_customer);
      update public.normalized_customers set
        import_id = p_import_id,
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
        normalized_key = btrim(p_customer ->> 'normalized_key'),
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
        delivery_territory_id = v_candidate.delivery_territory_id,
        updated_at = clock_timestamp()
      where id = v_existing.id and company_id = p_company_id
      returning * into v_saved;
    else
      if p_expected_updated_at is not null then raise exception 'expected_customer_missing'; end if;
      v_candidate := jsonb_populate_record(null::public.normalized_customers, p_customer);
      v_candidate.id := extensions.gen_random_uuid();
      v_candidate.company_id := p_company_id;
      v_candidate.import_id := p_import_id;
      v_candidate.customer_name := btrim(p_customer ->> 'customer_name');
      v_candidate.normalized_key := btrim(p_customer ->> 'normalized_key');
      v_candidate.monthly_revenue := coalesce(v_candidate.monthly_revenue, 0);
      v_candidate.last_order_days := coalesce(v_candidate.last_order_days, 0);
      v_candidate.visit_count := coalesce(v_candidate.visit_count, 0);
      v_candidate.delivery_km := coalesce(v_candidate.delivery_km, 0);
      v_candidate.review_keywords := coalesce(v_candidate.review_keywords, '{}'::text[]);
      v_candidate.created_at := clock_timestamp();
      v_candidate.updated_at := clock_timestamp();
      insert into public.normalized_customers select (v_candidate).*
      returning * into v_saved;
    end if;

    update public.customer_imports
    set status = 'completed', completed_at = clock_timestamp(), error_message = null
    where id = p_import_id and company_id = p_company_id;
  exception when others then
    update public.customer_imports
    set status = 'failed', completed_at = clock_timestamp(),
      error_message = 'customer_manual_save_failed:' || sqlstate
    where id = p_import_id and company_id = p_company_id;
  end;

  return query
  select item.id, item.status, false,
    case when item.status = 'completed' then to_jsonb(v_saved) else null::jsonb end,
    item.error_message
  from public.customer_imports item
  where item.id = p_import_id and item.company_id = p_company_id;
end;
$$;

revoke all on function public.save_customer_manual_atomic_draft(
  uuid, uuid, jsonb, uuid, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.save_customer_manual_atomic_draft(
  uuid, uuid, jsonb, uuid, timestamptz
) to service_role;

commit;
