-- REVIEW ONLY: 운영 적용 금지. 사용자 승인 후 실행합니다.
-- 앱의 extractLeadAdministrativeArea와 같은 규칙으로 기존 주소의 시·도 + 첫 시·군·구를 추출합니다.

with tokenized as (
  select
    lead.id,
    lead.company_id,
    regexp_split_to_array(
      regexp_replace(regexp_replace(btrim(lead.address), '[(),]', ' ', 'g'), '\s+', ' ', 'g'),
      ' '
    ) as tokens
  from public.business_permit_leads lead
  where lead.administrative_area is null
    and nullif(btrim(lead.address), '') is not null
), parsed as (
  select
    tokenized.id,
    tokenized.company_id,
    concat_ws(
      ' ',
      case tokenized.tokens[1]
        when '서울' then '서울특별시' when '부산' then '부산광역시'
        when '대구' then '대구광역시' when '인천' then '인천광역시'
        when '광주' then '광주광역시' when '대전' then '대전광역시'
        when '울산' then '울산광역시' when '세종' then '세종특별자치시'
        when '경기' then '경기도' when '강원' then '강원특별자치도'
        when '충북' then '충청북도' when '충남' then '충청남도'
        when '전북' then '전북특별자치도' when '전남' then '전라남도'
        when '경북' then '경상북도' when '경남' then '경상남도'
        when '제주' then '제주특별자치도'
        else tokenized.tokens[1]
      end,
      local_area.value
    ) as administrative_area
  from tokenized
  left join lateral (
    select token.value
    from unnest(tokenized.tokens) with ordinality as token(value, position)
    where token.position > 1
      and token.value ~ '(시|군|구)$'
    order by token.position
    limit 1
  ) local_area on true
)
select
  company_id,
  count(*) as target_count,
  count(*) filter (where administrative_area like '% %') as parseable_count,
  count(*) filter (where administrative_area not like '% %' or administrative_area is null) as unparseable_count
from parsed
group by company_id
order by company_id;

-- 승인 후 실행할 UPDATE
-- with tokenized as (...위와 동일...), parsed as (...위와 동일...)
-- update public.business_permit_leads lead
-- set administrative_area = parsed.administrative_area
-- from parsed
-- where lead.id = parsed.id
--   and parsed.administrative_area like '% %';
