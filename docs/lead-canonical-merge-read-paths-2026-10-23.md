# Canonical 리드 병합 전 읽기 경로 점검

상태: 설계 완료, 운영 스키마 적용과 코드 필터 배포 전. `merged_into_lead_id` 컬럼이 아직 운영에
없으므로 PostgREST 조건을 먼저 배포하면 전체 리드 조회가 실패한다. 순서는 메타데이터 컬럼 적용 →
아래 필터 배포 → 숫자 회귀 확인 → 병합 실행 승인이다.

| 목적 | 함수/경로 | 필터 위치 |
|---|---|---|
| 리드 목록·지도·건수 | `listPermitLeads`, `supabasePermitLeadCount` | 목록 본문과 count |
| 추천 큐·영업 대상 | `getPermitLeadQueues` | 큐별 공통 조건 |
| 지도 주변 리드 | `findNearbyPermitLeads` | 후보 조회 |
| 추천 점수 | `refreshPermitLeadRecommendationScores` | 활성 후보 조회 |
| 카카오 보강 | `enrichLeadsMissingContactInfo` | RPC 결과 재검증·fallback |
| 키워드 중복 판정 | `runKakaoKeywordLeadSweep` | 기존 리드명 조회 |
| 적재 fingerprint | `listExistingCanonicalLeadRows`, `listExistingLeadsByBusinessNumbers` | 대표 후보 조회 |
| 거래처 매칭 | `excludeMatchingLeadsForNewCustomer` | 매칭 후보 조회 |
| 업종·지역 통계 | `getKakaoIndustryBackfillPreview`, `listPermitLeads` 기반 통계 | 원본 후보 조회 |
| 리드 전환 | `convertPermitLeadToCustomer`, `getPermitLeadConversionPreview` | losing lead 거부·대표 안내 |
| 행동·영업시간 저장 | `recordPermitLeadAction`, `saveLeadBusinessHours` | losing lead 쓰기 거부 |

과거 감사 이력은 원래 리드 소속을 추적할 수 있어야 하므로 관리자 감사 화면에서 숨기지 않고,
`lead_merge_move_logs`로 원래 리드와 대표 리드를 함께 확인한다.

## 배포 차단 조건

- 메타데이터 컬럼과 FK 적용 전 코드 필터 배포 금지
- 병합 전 위 경로의 대표 리드 건수와 현재 건수가 동일해야 함
- source record/영업시간 UNIQUE 충돌이 0건이어야 함
