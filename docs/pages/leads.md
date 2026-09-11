# Leads (영업리드/신규리드)

## Status
운영 중. 신규리드/영업리드 구분, 추천 점수, 지도 연동, 체이닝 수집까지 구현 완료.

## Goal
인허가 데이터와 카카오 키워드 검색을 기반으로 신규 개업 거래처 후보(신규리드)와 검색량 기반 영업 대상(영업리드)을 수집·분류·추천한다.

## Owner Domain
lead

## Related Domains
customer (리드→거래처 전환, 교차 중복)

## Allowed Files
- `app/leads/permits/page.tsx`
- `components/permit-leads-view.tsx`
- `components/lead-status-select.tsx`
- `components/sales-route-map-workspace.tsx` (지도 탭 안 리드 오버레이 — map-and-route.md와 공유, 마커 렌더링 자체는 그쪽 소관)
- `app/api/leads/**`
- `lib/gov-restaurant.ts`, `lib/seoul-restaurant.ts`, `lib/kakao-keyword-leads.ts`, `lib/leads.ts`

## Data Flow

| Source | Used For |
|---|---|
| `business_permit_leads`(인허가) | 신규 리드 기본 데이터 |
| 공공 인허가 API | 금일/금주/금월 신규 사업장 |
| 카카오/네이버 장소 검색 API | 주소/전화/장소 링크 보강 |
| 리뷰/메뉴 신호 | 견적 품목 추천(향후) |
| `lead_actions` | 전화/DM/견적/후속 상태 |

## UX Rules
- 신규 리드와 기존 거래처의 카드 정보 밀도를 맞춘다.
- 지도 마커와 우측 리드 목록은 항상 같은 필터 기준을 사용한다.
- 추천 사유는 짧고 근거 중심으로 표시한다.

## Do Not Touch
- `lib/store.ts`의 customer/sales 전용 섹션
- `auth/**`, `billing/**`

## Preserve
- 신규리드/영업리드 분류 로직(`getPermitLeadType`, 개시일 90일 기준 실시간 재계산 — next_action 텍스트 스냅샷에 의존하지 않음)
- 리드 카드의 네이버/카카오/구글 지도 링크(아이콘 배지)
- KPI 카드 클릭 → 목록 필터링
- 리드 테이블 정렬 가능한 헤더
- "이어서 계속 수집" 체이닝 수집 + 일일 상한
- 개업일 미확인 리드가 신규리드로 잘못 분류되지 않음(90일 초과/미확인은 영업리드)

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 신규리드/영업리드 배지가 실제 개시일 기준과 일치하는지 샘플 확인

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-07

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 지도 링크 항상 노출, 리드 공급원 섹션 기본 숨김
- [x] KPI 카드 클릭 필터링, 테이블 헤더 정렬
- [x] 신규리드/영업리드 구분(KPI 카드, 필터, 배지, 상세 드로어)
- [x] 개시일 미확인/90일 초과 리드를 영업리드로 정확히 재분류(회귀 버그 2건 수정 이력 있음 — isNewLead 계산 로직 주의)
- [x] 카카오 키워드 탐색 리드의 라벨 버그 수정("최근 90일 신규 인허가" 오표기 → "영업리드(검색량 기반 타겟팅)")
- [x] 전국/서울 공공데이터 야간 자동수집 커서 기반 이어달리기(일일 진행률 보존)
- [x] 수집 스캔 타임아웃 방지(시간 예산/청크 상한)
- [x] 리드별 일일 호출 상한(외부 API 쿼터 보호)

## TODO
- [ ] 리드 갱신 상태 확인(사용자 액션 필요 — Claude/Codex 작업 아님)
- [ ] 거래처-리드 교차 중복 병합(`docs/pages/customers.md`와 공동)
- [ ] 인스타그램 ID 탐색/저장/복사(미착수)
- [ ] 메뉴/리뷰 기반 견적 품목 추천(미착수, `docs/pages/sales-assistant.md`와 겹칠 수 있음)

## KNOWN ISSUES
없음(이번 세션 기준). `isNewLead` 계산은 과거 두 차례 방향이 뒤바뀌는 회귀가 있었던 지점이므로, 이 로직을 다시 건드릴 땐 카카오 키워드 소스(`kakao_keyword_search`, 날짜 없음 → 항상 영업리드)와 인허가 자동수집 소스(날짜 있음 → 90일 기준)를 분기하는 조건을 각별히 주의해서 확인한다.
