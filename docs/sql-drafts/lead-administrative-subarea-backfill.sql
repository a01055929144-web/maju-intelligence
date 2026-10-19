-- REVIEW ONLY. 사용자 승인 전 운영 실행 금지.
-- 일반구가 있는 시의 기존 리드에만 administrative_subarea를 채웁니다.

with parsed as (
  select
    id,
    company_id,
    case (regexp_match(trim(address), '^(\S+)\s+(\S+시)\s+(\S+구)(?:\s|$)'))[1]
      when '서울' then '서울특별시' when '부산' then '부산광역시'
      when '대구' then '대구광역시' when '인천' then '인천광역시'
      when '광주' then '광주광역시' when '대전' then '대전광역시'
      when '울산' then '울산광역시' when '경기' then '경기도'
      when '충북' then '충청북도' when '충남' then '충청남도'
      when '전북' then '전북특별자치도' when '경북' then '경상북도'
      when '경남' then '경상남도'
      else (regexp_match(trim(address), '^(\S+)\s+(\S+시)\s+(\S+구)(?:\s|$)'))[1]
    end || ' ' ||
    (regexp_match(trim(address), '^(\S+)\s+(\S+시)\s+(\S+구)(?:\s|$)'))[2] || ' ' ||
    (regexp_match(trim(address), '^(\S+)\s+(\S+시)\s+(\S+구)(?:\s|$)'))[3] as administrative_subarea
  from public.business_permit_leads
  where administrative_subarea is null
    and address ~ '^\s*\S+\s+\S+시\s+\S+구(?:\s|$)'
), eligible as (
  select * from parsed
  where administrative_subarea in (
    '경기도 고양시 덕양구', '경기도 고양시 일산동구', '경기도 고양시 일산서구',
    '경기도 부천시 원미구', '경기도 부천시 소사구', '경기도 부천시 오정구',
    '경기도 성남시 수정구', '경기도 성남시 중원구', '경기도 성남시 분당구',
    '경기도 수원시 장안구', '경기도 수원시 권선구', '경기도 수원시 팔달구', '경기도 수원시 영통구',
    '경기도 안산시 상록구', '경기도 안산시 단원구',
    '경기도 안양시 만안구', '경기도 안양시 동안구',
    '경기도 용인시 처인구', '경기도 용인시 기흥구', '경기도 용인시 수지구',
    '충청북도 청주시 상당구', '충청북도 청주시 서원구', '충청북도 청주시 흥덕구', '충청북도 청주시 청원구',
    '충청남도 천안시 동남구', '충청남도 천안시 서북구',
    '전북특별자치도 전주시 완산구', '전북특별자치도 전주시 덕진구',
    '경상북도 포항시 남구', '경상북도 포항시 북구',
    '경상남도 창원시 의창구', '경상남도 창원시 성산구', '경상남도 창원시 마산합포구',
    '경상남도 창원시 마산회원구', '경상남도 창원시 진해구'
  )
)
update public.business_permit_leads lead
set administrative_subarea = eligible.administrative_subarea
from eligible
where lead.id = eligible.id
  and lead.company_id = eligible.company_id;
