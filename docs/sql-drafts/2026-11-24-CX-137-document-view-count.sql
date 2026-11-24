-- DRAFT ONLY. CX-137 긴 주소(/pricing-document#토큰) 조회수. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 지금은 resolve_pricing_document_short_link_v1 안에서만 view_count가 올라간다.
-- 문서를 실제로 읽는 공개 API가 이 함수를 불러 같은 값(view_count·first/last_viewed_at·view 이벤트)을 올린다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.record_pricing_document_view_v1(
  p_company_id uuid,
  p_share_link_id uuid,
  p_device_class text default 'unknown',
  p_requester_hash text default null,
  p_is_preview_bot boolean default false
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_link public.pricing_document_share_links%rowtype;
begin
  if p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown')
    or (p_requester_hash is not null and p_requester_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'document_view_invalid';
  end if;
  if p_is_preview_bot then return false; end if;
  select * into v_link from public.pricing_document_share_links
  where company_id = p_company_id and id = p_share_link_id;
  if not found or v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() then return false; end if;
  -- 새로고침·재요청이 조회수를 부풀리지 않게 같은 방문자는 10분에 1회만 센다(방문자 식별이 없으면 매번 센다).
  if p_requester_hash is not null and exists (
    select 1 from public.pricing_document_share_events e
    where e.company_id = p_company_id and e.share_link_id = p_share_link_id and e.event_type = 'view'
      and e.requester_hash = p_requester_hash and e.occurred_at > clock_timestamp() - interval '10 minutes'
  ) then return false; end if;
  update public.pricing_document_share_links set
    first_viewed_at = coalesce(first_viewed_at, clock_timestamp()),
    last_viewed_at = clock_timestamp(), view_count = view_count + 1
  where company_id = p_company_id and id = p_share_link_id;
  insert into public.pricing_document_share_events(company_id, share_link_id, event_type, device_class, requester_hash)
  values (p_company_id, p_share_link_id, 'view', p_device_class, p_requester_hash);
  return true;
end $$;

revoke all on function public.record_pricing_document_view_v1(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_pricing_document_view_v1(uuid, uuid, text, text, boolean) to service_role;
commit;
