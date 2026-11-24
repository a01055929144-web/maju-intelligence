-- DRAFT ONLY. CX-135 현장 기록(방문 / 비치 / 전단지) 통일. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 배송완료는 기존 delivery_route_stop_photos를 그대로 쓰고 이 표에 넣지 않는다.
-- 쓰기는 서버(service_role)만. RLS를 켜고 anon/authenticated에는 아무 권한도 주지 않는다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.field_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('visit', 'placement', 'flyer')),
  -- 비치(placement)일 때만: 단가표(price_sheet)·견적서(quote)·카탈로그(catalog) 중 1개 이상
  placement_types text[] not null default '{}'
    check (placement_types <@ array['price_sheet', 'quote', 'catalog']::text[]),
  actor_user_id uuid not null references public.app_users(id),
  actor_member_id uuid,
  customer_id uuid,
  lead_id uuid,
  -- CX-137 알바 배정 연결용. 지금은 비워 둔다(FK 없음).
  assignment_id uuid,
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  accuracy_m numeric(8, 1) not null check (accuracy_m >= 0 and accuracy_m <= 100000),
  captured_at timestamptz not null,
  memo text check (memo is null or char_length(memo) <= 500),
  -- 사진 수는 field_record_photos 트리거가 유지한다. 사진 1장 이상이어야 방문 인정.
  photo_count smallint not null default 0 check (photo_count between 0 and 10),
  counts_as_visit boolean generated always as (photo_count >= 1) stored,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 120),
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  unique (company_id, idempotency_key),
  foreign key (company_id, customer_id) references public.normalized_customers(company_id, id),
  foreign key (company_id, lead_id) references public.business_permit_leads(company_id, id),
  check ((kind = 'placement') = (cardinality(placement_types) >= 1))
);
create index field_records_company_captured_idx on public.field_records (company_id, captured_at desc);
create index field_records_lead_idx on public.field_records (company_id, lead_id, captured_at desc) where lead_id is not null;
create index field_records_customer_idx on public.field_records (company_id, customer_id, captured_at desc) where customer_id is not null;
create index field_records_actor_idx on public.field_records (company_id, actor_user_id, captured_at desc);

create table public.field_record_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  record_id uuid not null,
  media_kind text not null default 'photo' check (media_kind in ('photo', 'video')),
  storage_path text not null check (char_length(storage_path) between 1 and 500),
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm')),
  size_bytes bigint not null check (size_bytes > 0),
  duration_seconds numeric(6, 2),
  sort_order smallint not null check (sort_order between 0 and 9),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (company_id, record_id) references public.field_records(company_id, id) on delete cascade,
  unique (record_id, sort_order),
  -- 사진은 8MB 이하, 영상은 50MB 이하·30초 이하(영상은 길이 필수)
  check ((media_kind = 'photo' and mime_type like 'image/%' and size_bytes <= 8388608 and duration_seconds is null)
      or (media_kind = 'video' and mime_type like 'video/%' and size_bytes <= 52428800
          and duration_seconds is not null and duration_seconds > 0 and duration_seconds <= 30))
);
create index field_record_photos_record_idx on public.field_record_photos (company_id, record_id);

-- 사진 수 유지(영상은 사진 수에 넣지 않는다)
create function public.field_record_photo_count_sync_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_record uuid;
begin
  v_company := coalesce(new.company_id, old.company_id);
  v_record := coalesce(new.record_id, old.record_id);
  update public.field_records r set photo_count = (
    select count(*) from public.field_record_photos p
    where p.company_id = v_company and p.record_id = v_record and p.media_kind = 'photo')
  where r.company_id = v_company and r.id = v_record;
  return null;
end $$;
create trigger field_record_photos_count_sync
  after insert or delete on public.field_record_photos
  for each row execute function public.field_record_photo_count_sync_v1();

alter table public.field_records enable row level security;
alter table public.field_record_photos enable row level security;
alter table public.field_records force row level security;
alter table public.field_record_photos force row level security;
revoke all on table public.field_records, public.field_record_photos from public, anon, authenticated;
grant select, insert on table public.field_records, public.field_record_photos to service_role;
revoke all on function public.field_record_photo_count_sync_v1() from public, anon, authenticated, service_role;

-- 기록 한 번에 만들기(원자적·멱등). 서버가 업로드를 마친 저장 경로만 넘긴다.
-- 리드에 연결되면 리드 영업 기록(lead_actions)에도 action_type=field_visit 한 줄을 남겨 타임라인에 "현장 기록"으로 보이게 한다.
-- visit은 영업 성과의 "연락"(LEAD_CONTACT_ACTION_TYPES)으로 세어지므로 쓰지 않는다(알바는 상담을 하지 않는다).
create function public.create_field_record_v1(
  p_company_id uuid, p_actor_user_id uuid, p_actor_member_id uuid, p_kind text, p_placement_types text[],
  p_customer_id uuid, p_lead_id uuid, p_assignment_id uuid, p_latitude numeric, p_longitude numeric,
  p_accuracy_m numeric, p_captured_at timestamptz, p_memo text, p_idempotency_key text, p_media jsonb, p_actor_name text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_existing public.field_records%rowtype; v_item jsonb; v_i integer := 0; v_photos integer := 0;
  v_materials text[]; v_lead_action uuid; v_prefix text := p_company_id::text || '/field-records/';
begin
  -- 기록자는 이 회사의 활성 구성원이어야 한다(다른 회사 사람·비활성·다른 사람의 member id 거부).
  if p_actor_user_id is null or not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id and m.status = 'active'
      and (p_actor_member_id is null or m.id = p_actor_member_id)
  ) then raise exception 'field_record_actor_forbidden'; end if;
  if p_media is null or jsonb_typeof(p_media) <> 'array' or jsonb_array_length(p_media) > 10 then
    raise exception 'field_record_media_invalid';
  end if;
  -- 저장 경로는 이 회사의 현장 기록 폴더 안이어야 한다(다른 회사·다른 폴더·상위 경로 거부).
  for v_item in select * from jsonb_array_elements(p_media) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'storage_path', '') = ''
      or left(v_item->>'storage_path', char_length(v_prefix)) <> v_prefix
      or position('..' in v_item->>'storage_path') > 0 then
      raise exception 'field_record_media_invalid';
    end if;
  end loop;
  select * into v_existing from public.field_records
  where company_id = p_company_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_existing.id, 'countsAsVisit', v_existing.counts_as_visit, 'reused', true);
  end if;
  insert into public.field_records(
    company_id, kind, placement_types, actor_user_id, actor_member_id, customer_id, lead_id, assignment_id,
    latitude, longitude, accuracy_m, captured_at, memo, idempotency_key)
  values (
    p_company_id, p_kind, coalesce(p_placement_types, '{}'), p_actor_user_id, p_actor_member_id, p_customer_id, p_lead_id,
    p_assignment_id, p_latitude, p_longitude, p_accuracy_m, p_captured_at, nullif(btrim(coalesce(p_memo, '')), ''), p_idempotency_key)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_media) loop
    insert into public.field_record_photos(company_id, record_id, media_kind, storage_path, mime_type, size_bytes, duration_seconds, sort_order)
    values (p_company_id, v_id, coalesce(v_item->>'kind', 'photo'), v_item->>'storage_path', v_item->>'mime_type',
      (v_item->>'size_bytes')::bigint, (v_item->>'duration_seconds')::numeric, v_i);
    if coalesce(v_item->>'kind', 'photo') = 'photo' then v_photos := v_photos + 1; end if;
    v_i := v_i + 1;
  end loop;
  if p_lead_id is not null then
    v_materials := array(select case t when 'price_sheet' then '단가표' when 'quote' then '견적서' when 'catalog' then '브로슈어' end
      from unnest(coalesce(p_placement_types, '{}')) t);
    insert into public.lead_actions(company_id, lead_id, action_type, result, memo, actor_name, collateral_types, metadata)
    values (p_company_id, p_lead_id, 'field_visit',
      case when v_photos >= 1 then '현장 기록' else '현장 기록(사진 없음 · 방문 인정 안 됨)' end,
      nullif(btrim(coalesce(p_memo, '')), ''), nullif(btrim(coalesce(p_actor_name, '')), ''), coalesce(v_materials, '{}'),
      jsonb_build_object('fieldRecordId', v_id, 'fieldRecordKind', p_kind, 'countsAsVisit', v_photos >= 1))
    returning id into v_lead_action;
  end if;
  return jsonb_build_object('id', v_id, 'countsAsVisit', v_photos >= 1, 'reused', false, 'leadActionId', v_lead_action);
end $$;
revoke all on function public.create_field_record_v1(uuid, uuid, uuid, text, text[], uuid, uuid, uuid, numeric, numeric, numeric, timestamptz, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_field_record_v1(uuid, uuid, uuid, text, text[], uuid, uuid, uuid, numeric, numeric, numeric, timestamptz, text, text, jsonb, text) to service_role;
commit;
