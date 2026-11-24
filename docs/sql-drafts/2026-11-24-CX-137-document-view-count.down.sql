-- DOWN: CX-137 조회수 함수 제거 + 짧은 주소 해석 함수를 이전 정의(조회수 집계 포함)로 복원.
-- 이미 쌓인 view_count와 view 이벤트는 지우지 않는다.
begin;
create or replace function public.resolve_pricing_document_short_link_v1(
  p_short_code text, p_requester_hash text, p_device_class text default 'unknown',
  p_is_preview_bot boolean default false, p_expected_company_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_link public.pricing_document_share_links%rowtype;
  v_guard text;
begin
  if coalesce(p_short_code, '') !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz]{10}$'
    or coalesce(p_requester_hash, '') !~ '^[0-9a-f]{64}$'
    or p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown') then
    return jsonb_build_object('status', 'unavailable');
  end if;
  select * into v_link from public.pricing_document_share_links
  where short_code = p_short_code;
  if not found or (p_expected_company_id is not null and v_link.company_id <> p_expected_company_id)
    or v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  v_guard := public.pricing_s2_public_request_guard(
    v_link.company_id, 'short-document', p_requester_hash,
    jsonb_build_object('prefix', left(p_short_code, 3)), 30);
  if v_guard <> 'allowed' then return jsonb_build_object('status', 'unavailable'); end if;
  if not p_is_preview_bot then
    update public.pricing_document_share_links set
      first_viewed_at = coalesce(first_viewed_at, clock_timestamp()),
      last_viewed_at = clock_timestamp(), view_count = view_count + 1
    where company_id = v_link.company_id and id = v_link.id;
    insert into public.pricing_document_share_events(
      company_id, share_link_id, event_type, device_class, requester_hash
    ) values (v_link.company_id, v_link.id, 'view', p_device_class, p_requester_hash);
  end if;
  return jsonb_build_object('status', 'available', 'companyId', v_link.company_id,
    'shareLinkId', v_link.id, 'documentId', v_link.document_id,
    'documentVersionId', v_link.document_version_id);
end;
$$;
drop function if exists public.record_pricing_document_view_v1(uuid, uuid, text, text, boolean);
commit;
