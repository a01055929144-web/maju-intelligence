# WO-1 공용 매장 원장 — 승인 전 설계·실측 보고

## 승인 경계

- SQL 초안: `docs/sql-drafts/wo-1-shared-business-places.sql`
- 운영 적용 전 대표 승인 필요. 이 문서 작성 시점에는 운영 DB 변경과 코드 배포를 하지 않았다.
- 적용 후 구현 순서: 공용 원장 upsert → 회사별 영업 지역·업종 집합 조회 → 기존 `ingestPermitLeadRows` 호출 → 기존 회사별 전국 API 반복 호출 제거.

## 데이터셋과 변환

| dataset_type | endpoint | lead_type | 업종 기본 규칙 |
|---|---|---|---|
| `general_restaurant` | `/1741000/general_restaurants/info` | restaurant | 기존 일반음식점 분류 재사용 |
| `rest_cafe` | `/1741000/rest_cafes/info` | restaurant | 커피숍·제과→카페/디저트, 일반조리판매·기타→상호 기반 |
| `bakery` | `/1741000/bakeries/info` | restaurant | 카페/디저트 |
| `group_meal_facility` | `/1741000/group_meal_facilities/info` | meal_service | 급식 |
| `contract_catering` | `/1741000/contract_catering/info` | meal_service | 급식 |

공통 후보 칸은 `BPLC_NM`, `ROAD_NM_ADDR`, `LOTNO_ADDR`, `LCPMT_YMD`, `CLSBIZ_YMD`,
`DTL_SALS_STTS_NM`, `TELNO`, `BZSTAT_SE_NM`, `SNTTN_BZSTAT_NM`, `MNG_NO`,
`LAST_MDFCN_PNT`, `LCTN_AREA`, `FCLT_TOTAL_SCL`, `HPG`다. 실제 키가 있는 환경에서 각 데이터셋
첫 호출 결과를 비교한 뒤 매퍼 테스트를 고정한다. 로컬 운영 env에는 `GOV_RESTAURANT_API_KEY`가 없어
이번 승인 전 단계에서는 실호출하지 못했다.

## 호출량 변화

- 실제 운영 회사: 2개.
- 현재 일반음식점 스캔은 회사마다 최대 150페이지이므로 예정 호출량은 `2 × (최대 150 + 첫 페이지)` ≈ 최대 302회/일이다.
- 공용 원장 전환 후 5개 데이터셋을 각각 한 번 스캔하면 `5 × (최대 150 + 첫 페이지)` ≈ 최대 755회/일이며,
  회사가 늘어도 증가하지 않는다. 기존 방식으로 5개 데이터셋을 두 회사에 적용하면 최대 1,510회/일이다.
- 개발계정 공식 한도 10,000회/일 대비 공용 원장 예상 상한은 약 7.6%. 실제 호출 수는 시간 예산으로 더 낮을 수 있어
  `lead_sync_runs`에 dataset별 fetched/scannedPages/error를 남긴다.

## 운영 DB 읽기 측정(2026-10-25)

| 회사 | 미병합 리드 | gov | seoul | kakao keyword |
|---|---:|---:|---:|---:|
| 본사 `04ebb7bb…` | 12,030 | 3,932 | 5,977 | 2,121 |
| 시범사 `898d85fc…` | 3,456 | 1,460 | 1,996 | 0 |

강남구 최근 30일 기존 일반음식점 계열 기준:

| 회사 | 총계 | gov | seoul | 전화 | 인스타 | 비활성·제외 |
|---|---:|---:|---:|---:|---:|---:|
| 본사 | 174 | 44 | 130 | 22 | 0 | 54 |
| 시범사 | 102 | 17 | 85 | 16 | 0 | 65 |

휴게음식점은 아직 수집하지 않아 강남구 30일 휴게음식점 수·중복·전화/홈페이지/인스타 확보율은
실측 불가다. 마이그레이션 적용 후 첫 공용 원장 드라이런에서 별도 보고한다.

## 안전·격리

- `shared_business_places`는 company_id가 없고 service_role만 접근한다. `anon/authenticated/public` 권한을 회수하고 RLS를 켠다.
- 회사별 담당자·상태·메모·`lead_actions`·직원 입력 연락처·사용자 칸은 공용 원장에 저장하지 않는다.
- 회사 리드는 `(company_id, shared_place_id)`로만 연결하고 기존 canonical/폐업/대상업종/영업지역 규칙은
  `ingestPermitLeadRows`에서 계속 적용한다.
- 동일 장소의 영업자 변경을 자동 병합하지 않도록 fingerprint는 조회용 비고유 인덱스만 둔다.
- 국세청 상태조회 확대는 기존 주 1회 흐름에 사업자번호 있는 리드를 추가하되, 폐업 결과는
  `폐업 확인 필요`만 기록하고 자동 제외하지 않는다.

## 외부 이용 조건 확인

- 공공데이터포털의 행정안전부 일반음식점 페이지는 REST/JSON+XML, 일간 갱신, 이용허락범위 제한 없음,
  개발계정 10,000회/일을 명시한다.
- 행정안전부 계열 데이터는 출처 표시를 제품·문서 하단에 유지한다.
- 카카오 로컬 결과는 공용 원장의 원천 레코드로 재배포하지 않고, 회사별 리드의 주소 정리·좌표 보강에만 사용한다.
  카카오 다수 고객 제공·장기 저장 범위는 구현 전 약관 재확인이 필요하다.

## 승인 후 구현 파일 계획

- `lib/public-data/gov-food-datasets.ts`: 데이터셋 정의와 공통 raw mapper.
- `lib/shared-places.ts`: 공용 원장 upsert/회사별 대상 조회 repository.
- `app/api/cron/business-status/route.ts`: 공용 수집 1회 실행 후 회사별 fan-out.
- `lib/gov-restaurant.ts`: 기존 회전 스캔을 공통 fetcher로 위임하되 호환 export 유지.
- 테스트: 데이터셋 공통 필드, 면적/홈페이지, 폐업·변경, 회사 간 데이터 격리, 동일 원천키 upsert.
