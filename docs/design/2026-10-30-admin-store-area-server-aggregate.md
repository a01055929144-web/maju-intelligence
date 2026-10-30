# 관리자 매장 면적 서버 집계 초안

## 상태와 승인 경계

- SQL: `docs/sql-drafts/admin-store-area-profile-rpc.sql` 초안. 운영 DB 미실행.
- API는 관리자 세션, 유효한 `companyId`, `ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED=true`, `ADMIN_LEAD_STORE_AREA_RPC_ENABLED=true`를 모두 요구한다.
- 두 플래그 기본값은 OFF다. SQL을 정식 migration으로 승인·적용하고 아래 EXPLAIN을 검토하기 전에는 켜지 않는다.
- RPC는 `service_role`만 실행할 수 있고 `security invoker`로 동작한다. 원문 행, 원천 키, 전체 URL은 결과와 로그에 포함하지 않는다.

## 60초와 max_rows

기존 구현은 운영 리드 약 22,003건과 원천 레코드를 페이지로 모두 서버 메모리에 적재했다. Supabase 기본 최대 반환량 1,000건이면 데이터셋마다 약 23회, `max_rows=100`이면 약 221회의 왕복이 필요해 60초 제한을 안정적으로 보장할 수 없다. RPC는 PostgREST 응답을 JSON 한 건으로 고정하므로 `max_rows`의 영향을 받지 않으며, 집계와 정렬은 Postgres 안에서 수행한다.

## 회사 격리와 응답 범위

- 모든 리드·원천 CTE가 `company_id = p_company_id`로 시작한다.
- API가 회사 UUID를 필수로 받고 RPC에 그 값 하나만 전달한다.
- 응답은 전체/빈값/0/이상치/유효값 건수와 비율, 업종별 중앙값, 동일 `lead_id`의 두 원천 비교 집계만 포함한다.
- 동일 리드가 있어도 양쪽 유효 면적이 없으면 `measurement=unmeasured`다.

## 표본 정합성

`tests/store-area-source-profile.test.ts`의 표본을 SQL과 동일한 규칙으로 검증한다. 빈값 1, 0㎡ 1, 유효값 10·30㎡ 2, 100,001㎡ 이상치 1이면 전체 5, 각 비율 20%/20%/40%/20%, 한식 중앙값 20㎡다. 동일 리드의 30㎡와 30.01㎡는 비교 가능 1건·허용 오차 내 일치 1건·차이 중앙값 0.01㎡이며, 한쪽이 빈값인 동일 리드는 미측정 1건으로 분리한다.

로컬에는 PostgreSQL 실행기가 없어 SQL 자체를 실행하지 않았다. 정식 적용 전 비운영 DB에서 위 표본과 기존 TypeScript 집계 결과를 동일 회사 범위로 비교해야 한다.

원천 면적은 TypeScript와 동일하게 문자열 양끝 공백 제거 → 콤마 제거 → 숫자 판정 → 소수 둘째 자리 반올림 순서로 처리한다. 두 원천 일치 여부도 각각 반올림된 값의 차이를 다시 둘째 자리로 반올림한 뒤 0.01㎡ 이하인지 판단한다. 로컬 PG 실측을 하지 못했으므로 이 경계값은 비운영 DB 검증의 필수 항목이다.

## 인덱스와 실행 계획 검토

현재 확인된 인덱스:

- `business_permit_leads`: 회사가 선두인 period/status/duplicate 등 인덱스는 있으나 `(company_id) include (store_area_sqm, industry_raw)` 전용 인덱스는 없다.
- `business_permit_lead_source_records`: `(company_id, lead_id)`와 `(company_id, source, source_record_key)` UNIQUE가 있다.

중앙값은 회사 행을 읽고 정렬해야 하므로 무조건 새 인덱스를 추가하지 않는다. 비운영 DB에서 아래를 확인한 뒤 실제 병목일 때만 후보 인덱스를 별도 승인한다.

```sql
explain (analyze, buffers, settings, timing off)
select public.admin_store_area_profile('검증용-회사-UUID'::uuid);
```

검토 기준:

- 반환 JSON 1행, 60초보다 충분히 낮은 실행 시간
- 두 테이블 모두 다른 회사 행을 대량으로 읽지 않는 계획
- 큰 디스크 spill이나 과도한 temp read/write 없음
- 통계가 오래됐다면 인덱스 추가 전에 `analyze` 후 재측정
- 후보: `business_permit_leads(company_id) include (store_area_sqm, industry_raw)` 및 `business_permit_lead_source_records(company_id, source, lead_id, id)`. 쓰기 비용과 인덱스 크기를 함께 비교하고, 실제 계획 개선이 확인될 때만 migration에 포함

## 적용 순서

1. 대표 승인 후 정식 migration 생성
2. 비운영 DB 적용 및 표본 정합성·권한 거부(`anon`, `authenticated`) 확인
3. 실제 규모 회사로 EXPLAIN ANALYZE 검토
4. 운영 적용 후 스키마 캐시 반영 확인
5. `ADMIN_LEAD_STORE_AREA_RPC_ENABLED=true`, 이후 별도 승인으로 상위 기능 플래그 활성화
