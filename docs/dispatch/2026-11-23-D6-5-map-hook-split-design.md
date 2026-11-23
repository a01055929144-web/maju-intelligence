# D-6 ⑤ 지도 본체 훅 분리 설계 메모 (2026-11-23)

대상: `components/sales-route-map-workspace.tsx`의 `SalesRouteMapWorkspace` (267~3365줄, 약 3,100줄). 이 PR은 **문서만**이며 코드는 바꾸지 않는다. ①~④ 병합 뒤 기준 파일 4,490줄.

## 현재 구조 (줄 번호는 ④ 병합 뒤)

| 구간 | 내용 |
| --- | --- |
| 268~1500 | `useState` 78 · `useEffect` 24 · `useMemo/useCallback` 54 선언 (상태·파생값) |
| 1509~1700 | 패널 히스토리 동기화 effect, 로컬 저장 effect 8개(1666~1673) |
| 1690~2126 | 핸들러(등록·수정·삭제·경로 등) |
| 2127~3365 | JSX 약 1,240줄 |

## 분리 원칙

1. **동작 변화 0.** 조각 하나 = 훅 하나 + 호출부 교체. 반환값은 기존 변수 이름 그대로 구조분해해 JSX는 건드리지 않는다.
2. 훅 파일은 `components/map/use-*.ts`. 순환 import 금지(기존 no-cycle 테스트 유지).
3. 훅끼리 공유하는 값은 인자로 받는다(전역·컨텍스트 새로 만들지 않음).
4. 한 PR = 한 훅. 지도 파일 잠금(2시간)을 걸고 시작, 병합 뒤 해제. PR마다 tsc·lint·test·build·e2e 지도(1440/390).

## 훅 후보 (의존이 적은 것부터)

| 순서 | 훅 | 가져올 상태 묶음 | 줄 | 의존 |
| --- | --- | --- | --- | --- |
| 1 | `useMapLocalPersistence` | storeAttachments·storeEdits(+SavedAt)·storeHistories·vehicleEdits(+SavedAt)·manualDrivers·manualVehicles 와 저장 effect 8개 | 431~449, 1666~1673 | 없음(`localStoreKeys`만). 가장 안전 |
| 2 | `useMapPanelLayout` | leftCollapsed·rightCollapsed·mapPanelMode·rightPanelTab·모바일 컨트롤·전체화면·헤더 높이 ref | 309~415, 1509~1549 | 히스토리 effect가 selectedId/detail과 얽힘 → 마지막에 |
| 3 | `useLeadRadiusSearch` | leadRadius* 9개·previewLeadId·`beginRadiusRequest` | 460~475 | geocodableStoresForRadius(인자) |
| 4 | `useAllLeadsForMap` | showAllLeadsOnMap·allLeadsForMap·loadState·필터 파생(industry/region/dong/stage/openDate) | 480~482, 1170~1380 | 이미 `use-map-filters.ts` 있음 → 겹침 먼저 확인 |
| 5 | `useLiveVehicles` | liveVehicleLocations·vehicleMasterRecords·분석·mainMapRoute*·todayCompletions·justConnected | 338~356, 973~1130 | 실시간 구독 effect, 정리(cleanup) 보존 필수 |
| 6 | `useMapSearch` | query·recentQueries·검색 결과·선택·일괄 등록 상태 | 269~306, 895~935 | `use-business-search.ts`와 경계 정리 |
| 7 | `useMapSalesArea` | mapSalesRegionsConfigured·assigned/expansionAreaLabels·outside 토글 | 486~519, 775 | |
| 8 | `useMapStoreData` | allStores·storeById·deliveryVehicles·visibleStores·gradeCounts 등 파생 | 615~670, 938~968 | 위 훅 값 모두 받는 마지막 조각 |

예상: 훅 1~7을 빼면 본체 약 3,100줄 → 약 1,800줄(JSX 1,240 + 핸들러 + 연결). 8번까지 하면 1,500줄대.

## 위험과 확인

- 실시간 구독·`useLatestRequest` 토큰: 훅으로 옮길 때 effect 의존 배열·cleanup을 그대로 복사하고 순서를 바꾸지 않는다(React는 호출 순서가 동작).
- 초기값이 localStorage를 읽는 lazy `useState`(`readLocal…`)는 SSR 안전 코드 그대로 유지.
- `initialCustomerId`·`initialView` 등 props 초기값은 훅 인자로 넘긴다.
- 겹치는 열린 PR: 착수 전 `gh pr list`로 지도 파일 수정 PR 확인(CX-111 등).

## 다음

①번 훅 `useMapLocalPersistence`부터 한 PR씩. 이 메모 병합 뒤 잠금을 걸고 시작한다.
