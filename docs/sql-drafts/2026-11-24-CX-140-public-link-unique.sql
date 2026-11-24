-- DRAFT ONLY. CX-140 ①: 문서당 활성 공개 링크 1개 — "새로 만들 때만" 막는다. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 공개 링크 = lead_id is null and send_id is null. 리드별 링크(lead_id not null, sales-kit)는 "그 매장이 봤는지" 추적용이라 여러 개 허용.
-- 이미 발급된 중복 링크는 끊지도 검사하지도 않는다(INSERT 전용 트리거, 데이터 변경 없음).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function public.pricing_public_share_link_unique_v1() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.lead_id is not null or new.send_id is not null or new.revoked_at is not null then return new; end if;
  -- 같은 문서를 동시에 만들어도 한 쪽만 통과하도록 문서 단위로 직렬화
  perform pg_advisory_xact_lock(hashtextextended('pricing_public_share:' || new.company_id::text || ':' || new.document_id::text, 0));
  if exists (select 1 from public.pricing_document_share_links l
      where l.company_id = new.company_id and l.document_id = new.document_id
        and l.lead_id is null and l.send_id is null and l.revoked_at is null and l.expires_at > clock_timestamp())
    then raise exception 'share_public_link_exists' using errcode = '23505'; end if;
  return new;
end $$;

create trigger pricing_public_share_link_unique
  before insert on public.pricing_document_share_links
  for each row execute function public.pricing_public_share_link_unique_v1();

commit;
