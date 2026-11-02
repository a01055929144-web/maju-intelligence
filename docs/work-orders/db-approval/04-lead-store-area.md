# 04 DB 승인 초안 — L-2 리드 매장 면적

> 상태: **승인 대기 · 운영 실행 금지**  
> 프로젝트: `fcmdvveqmcgtioelzqun`  
> 기능 플래그: `LEAD_STORE_AREA_ENABLED=false`, `NEXT_PUBLIC_LEAD_STORE_AREA_ENABLED=false` 유지

## 목적

행정안전부 일반음식점 원천의 `LCTN_AREA`와 서울시 일반음식점 원천의 `SITEAREA`를 리드의 매장 면적(㎡)으로 저장해 리드 목록·지도·모바일 영업에서 규모 표시와 필터에 사용한다.

## 요청 범위

1. `business_permit_leads.store_area_sqm numeric(12,2)` 추가
2. 값이 `NULL`이거나 `0 < store_area_sqm <= 100000`이도록 제약 추가
3. 회사별 빈값·양수·0·이상치·업종 중앙값과 원천 비교를 반환하는 서버 전용 `admin_store_area_profile(uuid)` 추가
4. 대표 회사에 한해 기존 `business_permit_lead_source_records.raw_payload.storeAreaSqm`을 원천으로 제한적 백필
   - 행정안전부·서울시 공식 원천만 사용
   - 유효한 양수 값만 반영
   - 최신 원천 기록 우선
   - 기존 비어 있지 않은 면적은 덮어쓰지 않음
   - 회사 범위를 명시하고 재실행해도 같은 결과가 되도록 구성

기존 초안:

- [`2026-10-29-lead-store-area-and-attachments.sql`](../../sql-drafts/2026-10-29-lead-store-area-and-attachments.sql)
- [`admin-store-area-profile-rpc.sql`](../../sql-drafts/admin-store-area-profile-rpc.sql)

`lead_attachments`는 L-2에 필요하지 않으므로 이번 승인 묶음에서 제외한다. 면적 출처는 기존 `business_permit_lead_source_records`의 `source`, `last_seen_at`, `raw_payload`를 사용하며 `store_area_source` 중복 컬럼은 추가하지 않는다.

## 읽기 전용 사전 측정

2026-11-02 운영 DB를 수정하지 않고 집계했다. 같은 이름의 활성 회사 레코드가 두 개라 둘 다 측정했다.

| 회사 ID | 전체 리드 | 원천에 유효 면적 있음 | 채움률 | 0 | 비숫자 | 이상치 | 중앙값 | 유효 범위 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `04ebb7bb-8da0-4723-8211-f2a947939344` | 18,114 | 48 | 0.26% | 0 | 0 | 0 | 27.72㎡ | 2~341.37㎡ |
| `898d85fc-c475-47e0-9943-91709e13a4bb` | 4,861 | 4 | 0.08% | 0 | 0 | 0 | 27.18㎡ | 7.26~40.92㎡ |

운영 `business_permit_leads`에는 아직 `store_area_sqm` 컬럼이 없다. 승인 전에는 공개·서버 플래그를 켜지 않는다.

## 기존 데이터 영향

- 스키마 추가 전 기존 리드 값은 변경하지 않는다.
- 승인 후 백필 대상은 위 공식 원천에 유효 면적이 남아 있고 `store_area_sqm IS NULL`인 대표 회사 리드로 제한한다.
- 리드 점수·등급은 이 묶음에서 재계산하지 않는다.
- 카카오 재매칭, 외부 API 재조회, 운영 리드 수집을 실행하지 않는다.

## 권한·격리

- 모든 조회와 백필은 `company_id`로 제한한다.
- 집계 RPC는 `security invoker`, 빈 `search_path`를 사용한다.
- 함수 실행 권한은 `public`, `anon`, `authenticated`에서 회수하고 `service_role`에만 부여한다.
- 원문 행·상호·주소·전화번호를 집계 응답에 포함하지 않는다.

## 승인 후 검증 계획

1. 폐기 가능한 PG17에서 컬럼·제약·RPC와 회사 격리 테스트
2. 대표 회사 ID를 확정한 뒤 백필 예상 건수와 대상만 읽기 재확인
3. 백필 전후 전체·양수·0·이상치 건수 대조
4. 다른 회사 행이 바뀌지 않았는지 확인
5. 10평·20평·30평 경계와 390px 표시를 Playwright 합성 데이터로 검증
6. 검증 완료 뒤에만 대표 회사 플래그 활성화를 별도 결정

## 승인 문구

운영 적용은 대표가 아래 형식으로 프로젝트와 범위를 명시해 승인하기 전까지 금지한다.

```text
DB-APPROVED: fcmdvveqmcgtioelzqun / L-2 리드 매장 면적 컬럼·서버 집계 RPC·대표 회사 제한 백필
```

