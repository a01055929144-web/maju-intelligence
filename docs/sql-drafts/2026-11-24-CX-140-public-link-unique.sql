-- DRAFT ONLY. CX-140 ①: 문서당 활성 공개 링크 1개 — 부분 unique 인덱스. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 활성 = 회수(revoked_at)되지 않은 것. 만료일(expires_at)은 보지 않는다: 공개 링크는 버전이 바뀌어도 같은 링크이고
-- 만료는 head 버전의 validUntil을 따라 연장되므로, 새 링크는 "회수한 뒤에만" 만든다.
-- 리드별 링크(lead_id is not null, sales-kit)는 "그 매장이 봤는지" 추적용이라 여러 개 허용. 데이터 변경 없음.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if exists (select 1 from public.pricing_document_share_links
      where lead_id is null and send_id is null and revoked_at is null
      group by company_id, document_id having count(*) > 1)
    then raise exception 'cx140_active_public_duplicates_exist_revoke_first'; end if;
end $$;

create unique index pricing_public_share_link_one_per_document_uq
  on public.pricing_document_share_links(company_id, document_id)
  where lead_id is null and send_id is null and revoked_at is null;

commit;
