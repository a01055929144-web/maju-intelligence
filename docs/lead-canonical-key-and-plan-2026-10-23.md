# 리드 canonical 후보 키와 병합 확정 기준

## 결정: 후보 키와 병합 확정 키 분리

`canonical_fingerprint`는 적재 중 빠르게 후보를 찾는 키로 유지한다. 우선순위는 사업자번호,
그 값이 없으면 정규화한 상호+기본주소다. 원천키는 `business_permit_lead_source_records`에서
별도로 먼저 조회한다. 출처별로 개업일·업태가 비어 있거나 표현이 달라지는 상황에서 이 필드까지
후보 키에 넣으면 동일 매장의 재수집도 새 리드가 되는 회귀가 생기므로 `(가)`보다 `(나)`가 안전하다.

병합 계획은 후보 키 안에서 아래 네 값이 모두 일치하는 행만 같은 `merge_confirmed_key`로 묶는다.

1. 정규화 상호
2. 정규화 상세주소(층·호 포함)
3. 개업일(알려진 값끼리 동일)
4. 정규화 원본 업태(알려진 값끼리 동일)

적재 경로도 후보 키 조회 후 `isCanonicalPlaceMatchSafe` 검사를 거치므로 같은 기준이다. 원천키나
사업자번호가 일치하면 그 강한 근거가 우선하며, 상호+주소만 일치할 때는 위 안전 검사를 통과해야 한다.

## 향후 UNIQUE 제안

`canonical_fingerprint`에는 UNIQUE를 걸지 않는다. 주인 변경이나 층·호가 다른 매장이 같은 후보 키를
가질 수 있기 때문이다. 별도 `canonical_merge_key` 컬럼을 도입한 뒤, 병합 완료·검증 이후 다음 조건의
부분 UNIQUE를 제안한다.

- 대상: `merged_into_lead_id is null and canonical_merge_key is not null`
- 제외: `status in ('주인 변경','폐업 확인 필요')`
- 키: `(company_id, canonical_merge_key)`

컬럼 및 인덱스 추가는 별도 승인 전 실행하지 않는다.
