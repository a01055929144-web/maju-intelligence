# Map & Route (지도 홈 / 오늘의 코스 / 배송 히스토리)

## Status
운영 중. 실시간 차량 위치, 리드 오버레이, 드래그앤드롭 코스 편집, 월별 배송 히스토리까지 구현 완료.

## Goal
영업사원/배송기사의 실시간 위치와 오늘의 방문 코스, 과거 배송 기록을 하나의 지도 워크스페이스에서 확인·조정한다.

## Owner Domain
route, delivery

## Related Domains
customer (거래처 마커), lead (신규 리드 오버레이), analytics (요약 카드)

## 페이지 구조에 대한 중요 사실
`app/dashboard/page.tsx`와 `app/routes/today/page.tsx`는 **같은 화면**이다. `app/routes/today`는 `/dashboard?view=course`로 리다이렉트만 하는 17줄짜리 파일이다. 실제 로직은 전부 `app/dashboard/page.tsx` → `components/sales-route-map-workspace.tsx`(loader 포함) 안에 있고, `view` 쿼리 파라미터로 지도/코스/히스토리 3개 탭을 전환한다. **이 세 탭을 서로 다른 페이지처럼 취급해 따로 작업 지시하지 않는다** — 한 컴포넌트를 공유하므로 한 탭을 고치다 다른 탭을 깨뜨릴 수 있다.

## Allowed Files
- `app/dashboard/page.tsx`
- `app/routes/today/page.tsx`
- `app/map/fullscreen/page.tsx` (전체화면 지도)
- `components/sales-route-map-workspace.tsx`
- `components/sales-route-map-workspace-loader.tsx`
- `components/kakao-address-map.tsx`
- `components/today-course-view.tsx`
- `components/delivery-history-view.tsx`
- `components/route-sequence-action.tsx`, `components/route-distance-action.tsx`, `components/route-batch-distance-action.tsx`
- `components/mobile-location-reporter.tsx` (직원 GPS 송신 쪽, 모바일과 공유)
- `lib/customer-navigation.ts`
- `app/api/routes/*`, `app/api/staff/location/*`

## Data Flow

| Source | Used For |
|---|---|
| `normalized_customers` | 기존 거래처 마커/목록 |
| `business_permit_leads` 등 lead 테이블 | 신규/영업 리드 마커 |
| `staff_location_events` | 실시간 차량/직원 위치 |
| `route_distance_cache` | 거리/시간 계산 캐시 |
| `route_plan_confirmations` | 확정된 방문 순서 |
| `company` 설정 | 출발지 주소, 메시지 기준값 |

## UX Rules
- 첫 화면은 지도 비중을 가장 크게 둔다.
- 보조 패널(우측 리드/거래처 목록)은 접기/펼치기 가능해야 하고, 지도/필터와 항상 동기화된다.
- 마커 색상과 의미(거래처/리드/차량별)를 명확히 고정한다.
- 카드 설명은 최소화하고 상태값과 액션 버튼 중심으로 구성한다.
- 모바일 폭에서 상단 버튼이 겹치지 않는지 확인한다.

## Do Not Touch
- `domains/customer/**`, `lib/store.ts`의 customer 섹션(마커 표시용 조회는 허용, 거래처 CRUD 로직 변경은 customers.md 소관)
- `auth/**`, `billing/**`

## Preserve
- 거래처 마커, 신규 리드 마커
- 차량별 고유 색상(마커/리스트/경로선 일치)
- GPS 조회 폴링(4초 간격) 및 접속 토스트
- 드래그앤드롭 방문 순서 변경 + 경로 확정 저장
- 배송완료 체크 표시, 완료 건수 카운트
- 배송 히스토리 월간 캘린더 + 확정 순서 vs 실제 GPS 경로 비교

## Task (이번에 진행할 작업이 있으면 여기 채움)
_(현재 비어있음 — 신규 작업 지시 시 이 섹션에 구체적 요구사항 기입)_

## Completion
- 기능 정상 동작
- TypeScript / lint / build PASS
- 회귀 확인: 지도/코스/히스토리 3탭 모두 재확인(하나만 고쳐도 셋 다 스모크 테스트)
- 지도 로딩, 마커 표시, 리드/거래처 토글, 우측 패널 동기화, 전체화면 지도(`/map/fullscreen`), 모바일 폭 버튼 겹침 없음

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (Claude 세션에서 npm install 불가, 사용자/Codex 확인 필요)

## COMPLETED
- [x] 라이브차량 위치 조회 + 지도 마커 렌더링
- [x] 차량별 고유 색상(마커/리스트/경로선)
- [x] 실제 GPS 경로 지도 표시(경로 토글)
- [x] 마커 부드러운 이동 애니메이션(requestAnimationFrame)
- [x] 접속 알림 토스트 + 4초 폴링
- [x] 신규 리드 지도 오버레이(새로고침 반영)
- [x] 배송 완료 표시(지도 마커 + 차량별 카운트)
- [x] 담당자별 배송 순서 드래그앤드롭
- [x] 배송 히스토리 달력(월별) + 확정 순서 vs 실제 GPS 비교
- [x] 우측 패널 가려짐 문제 수정
- [x] 차량 마커 클릭 시 vehicle-analysis 모달로 통일(고객 상세로 잘못 튀던 버그 수정)

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음(이번 세션 기준). 다만 `lib/store.ts`의 `getDeliveryHistoryForDate`가 `route_plan_confirmations`가 없는 날짜는 "현재 등록된 담당자 배정"으로 추정 표시함 — 과거 실제 배정과 다를 수 있음을 UI에 명시했는지 재확인 필요.
