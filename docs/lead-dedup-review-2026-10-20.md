# 리드 canonical 중복 방지 조사 (2026-10-20)

## 운영 적용 상태

2026-10-20에 `canonical_fingerprint`, `source_list`, `business_permit_lead_source_records`를 적용했다.
기존 리드 병합·삭제·폐업 갱신·업종 재분류 및 UNIQUE 인덱스는 적용하지 않았다.

## 출처 상태값

| 출처 | 영업/상태 | 폐업 판정 | 변경 시각 |
|---|---|---|---|
| 정부 일반음식점 | `DTL_SALS_STTS_NM`, `SALS_STTS_NM` | `CLSBIZ_YMD` 또는 폐업·취소·말소 상태 | `LAST_MDFCN_PNT`, `DAT_UPDT_PNT` |
| 서울 일반음식점 | `DTLSTATENM`, `TRDSTATENM` | `DCBYMD` 또는 폐업·취소·말소 상태 | `LASTMODTS` |

폐업 이벤트는 출처 이력에는 기록하지만 일치하는 대표 리드가 없으면 신규 리드를 만들지 않는다.

## 업종 분류 원칙

일반음식점 계열은 기본 영업 대상으로 본다. 중국식, 외국음식전문점, 횟집, 패밀리레스토랑,
경양식 및 `기타`는 대상에 남긴다. 미용·교육·의료·부동산·숙박·오락·자동차 정비 등
식자재 수요가 거의 없다고 명확히 판정 가능한 키워드만 자동 제외한다. 애매한 업태는 제외하지 않는다.

## 결론

현재 `business_permit_leads` 22,104건에는 사업자번호가 한 건도 없고, 서울/정부 API의 원천 관리번호도 매핑 단계에서 보존하지 않는다. 따라서 안정적인 적재 우선순위는 다음처럼 전환한다.

1. 같은 출처: 원천 관리번호(`서울 MGTNO`, `정부 MNG_NO` 계열 후보 키)로 기존 리드 탐색
2. 교차 출처: 사업자번호가 있으면 정규화 사업자번호
3. 그 외: 정규화 상호명 + 주소 canonical fingerprint

`business_permit_lead_source_records`가 출처별 최신 원문·상태를 보존하고, 대표 리드는 `source_list`와 canonical fingerprint를 가진다. UNIQUE fingerprint는 기존 중복 병합 뒤에만 건다.

## 폐업 처리

두 출처 모두 별도의 신규/변경 이벤트 타입을 주지 않고 최종수정시각으로 변경분을 제공한다. 신규/변경은 원천 관리번호 존재 여부로 판정한다. 폐업은 상태명 또는 폐업일로 판정한다.

| 출처 | 영업 상태 | 폐업 판정 | 변경 판정 |
|---|---|---|---|
| 정부 일반음식점 | `DTL_SALS_STTS_NM` / `SALS_STTS_NM` | `CLSBIZ_YMD` 존재 또는 폐업·취소·말소 상태 | `LAST_MDFCN_PNT` |
| 서울 일반음식점 | `DTLSTATENM` / `TRDSTATENM` | `DCBYMD` 존재 또는 폐업·취소·말소 상태 | `LASTMODTS` |

폐업 원문은 원천 이력에는 항상 upsert한다. 동일 원천 관리번호/사업자번호/canonical fingerprint의 기존 리드가 있으면 대표 리드만 비활성화하고, 없으면 신규 리드를 만들지 않는다.

## 기존 데이터 병합 원칙

- 사용자 연락·방문 기록이 있는 리드를 대표로 우선 선택한다.
- 다음 우선순위는 거래처 연결, 수동 전화, 카카오 확정 매칭, 최신 갱신 순이다.
- `lead_actions`, `lead_enrichment_events`, `lead_business_hour_intervals`, `sales_quotes`를 대표 ID로 옮긴 뒤 중복 행을 제거한다.
- 각 출처의 전화·인허가일·상태·원문은 source record에 보존한다.
- 운영 병합/재분류는 별도 승인 전 실행하지 않는다.

## 화면 집계 기준

상단 숫자는 canonical 대표 리드 중 `is_active=true`, 대상 업종, 기존 거래처 미연결인 행만 센다. 강남구 최근 30일 표본은 원본 832건, canonical 실제 영업 대상 214곳이다.
