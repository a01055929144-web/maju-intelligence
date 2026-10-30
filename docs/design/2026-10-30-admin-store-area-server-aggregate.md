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

2026-10-30 WSL `docker-desktop` 내부 메모리 기반 임시 PostgreSQL 16.14에서 함수 생성과 `docs/sql-drafts/admin-store-area-profile-rpc.verify.sql`을 실행했다. 경계값·업종 중앙값·두 원천 비교·다른 회사 제외·함수 권한·`service_role` 호출이 통과했다. 이 검증은 운영 DB와 무관하며 트랜잭션을 롤백했다.

- 표본: 회사 A 리드 7건·원천 6건, 회사 B 리드 1건·원천 1건
- 권한: `anon=false`, `authenticated=false`, `service_role=true`; 실제 `set local role service_role` 호출 성공
- 격리: 회사 A 결과에 회사 B의 77㎡ 및 원천 1건이 포함되지 않음
- 롤백: 검증 후 두 테이블 잔존 행 `0|0`
- 표본 EXPLAIN: `Result`, shared buffer hit 4, planning 0.025ms, execution 3.082ms

위 실행 계획은 8개 리드뿐인 문법·정합성 검증이며 운영 규모 인덱스 결정을 대신하지 않는다. 2.2만 건 상당의 비운영 복제본에서 아래 EXPLAIN을 다시 확인하기 전에는 두 기능 플래그를 켜지 않는다.

`docs/sql-drafts/admin-store-area-profile-rpc.scale-verify.sql`은 빈 임시 PostgreSQL DB에서 개인정보 없이 가짜 리드 22,754행·원천 기록 1,133행을 만들고 현재 운영과 같은 기본 인덱스 구성에서 함수의 실행 계획을 출력한다. `psql -v ON_ERROR_STOP=1 -f docs/sql-drafts/admin-store-area-profile-rpc.scale-verify.sql`로 실행한다. 마지막 `rollback`으로 자료와 역할을 남기지 않는다. 이 검증은 아직 실행하지 못했다. 현재 Windows 환경에는 `psql`·Docker 실행 파일이 없고 WSL 접근이 거부된다. 실제 운영 데이터 분포의 skew와 디스크 상태까지 재현하지는 못하므로, 실행 결과도 인덱스 승인 전 판단 자료로만 사용한다.

원천 면적은 TypeScript와 동일하게 문자열 양끝 공백 제거 → 콤마 제거 → 숫자 판정 순서로 처리한다. 음수·100,000㎡ 초과·정확한 0 분류는 반올림 전 원본 숫자로 판정하고, 유효 양수의 중앙값과 두 원천 비교에만 소수 둘째 자리 반올림값을 사용한다. 따라서 `-0.004`와 `100000.004`는 이상치, `0.004`는 반올림 결과가 0이어도 유효 양수다. 두 원천 일치 여부는 각각 반올림된 값의 차이를 다시 둘째 자리로 반올림한 뒤 0.01㎡ 이하인지 판단한다. 위 비운영 PostgreSQL 검증에 이 경계값을 포함했다.

같은 리드·출처에 여러 원천 기록이 있으면 유효한 면적 가운데 `last_seen_at`이 가장 최근인 값을 비교한다. UUID 정렬로 임의의 과거 값을 고르지 않는다.

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
