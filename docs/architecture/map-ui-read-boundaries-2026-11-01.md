# 지도 UI 읽기 경계 (ARC-09 / ARC-11)

> 상태: 2026-11-01 `main` (`fb7175e`)과 미병합 작업지시서 PR #106을 대조한 읽기 전용 조사다. 운영 DB, 기능 플래그, TMS 규칙은 변경하지 않는다.

## 소유권과 범위

- Owner: 지도 UI(01). 지도 레이어 조합, 선택 상태, 알림 표현만 소유한다.
- Related: 영업관리(리드), 거래처, TMS(02).
- TMS Owner(02): 배송일, 권역·호차·기사 배정, 코스 확정, 완료 기록, 차량 위치 노출 규칙과 KST 판정.
- 이번 변경: 새 차량 접속 알림을 `MapVehicleConnectionToast`로 분리하고 보조기술에도 상태를 알린다. 조회 API, 응답, 권한, 폴링, 지도 마커 계산은 유지한다.

## 읽기 출처와 상태 공유 지점

| 지도 레이어 | 서버/API 읽기 출처 | 지도 컴포넌트의 공유 상태 | 소유 경계 |
| --- | --- | --- | --- |
| 영업 리드 | `/api/leads/permits`, `/api/leads/permits/nearby`; 저장 원천은 `business_permit_leads`와 `lead_actions` | `allLeadsForMap`, `leadRadiusResult`, `detailLeadId`, 리드 필터 상태가 리드 마커·우측 목록에 함께 쓰임 | 리드 조회·전환 규칙은 영업관리. 지도는 조회 결과를 필터링하고 표시만 함 |
| 거래처 | `app/dashboard/page.tsx`가 `getCustomerMapSummaries()`와 `getTodayRoutePlan()`을 병렬 조회해 `mapMarkers`, `routePlan` prop으로 전달 | `allStores`, `selectedId`, `previewStoreId`, `vehicleFilterId`; 거래처 마커·상세 drawer·코스 목록이 같은 customer ID를 공유 | 거래처 기본정보는 customer. 지도는 회사/담당 범위가 적용된 서버 결과만 받음 |
| 배송 코스 | `getTodayRoutePlan()`의 거래처 배정과 `route_plan_confirmations`, 거리 캐시를 서버에서 조합 | `routePlan`은 입력 prop, `deliveryVehicles`와 `visibleStores`는 파생값. 코스 편집·확정 규칙 자체는 지도 소유가 아님 | 날짜별 호차·기사·코스·완료는 TMS(02) 소유 |
| 차량 위치·완료 | 첫 화면은 `getStaffVehicleLocations()`, 이후 `/api/staff/location?completions=true&date=...` 폴링 | `liveVehicleLocations`, `todayCompletions`, `selectedLiveVehicleId`, `justConnectedVehicle`; 차량 마커·상태 패널·완료 거래처 표시가 공유 | API가 서명 세션의 회사/직원 범위를 결정. 지도는 위치 쓰기나 노출 규칙을 만들지 않음 |

모든 레이어는 최종적으로 `mapDisplayMarkers`에서만 합쳐진다. 레이어 간 쓰기 공유는 없으며 customer ID, 차량/기사 표시 식별자와 현재 UI 선택값만 조인 지점으로 사용한다.

## 확인됨 / 보류 / 충돌

- 확인됨: `app/dashboard/page.tsx`가 회사 세션과 담당 범위를 서버에서 결정한 뒤 거래처·코스·초기 차량 위치를 전달한다.
- 확인됨: `/api/staff/location`은 요청 본문의 회사 ID를 받지 않고 인증 scope의 `companyId`를 사용하며, 제한 직원은 자기 `userId`와 배정 차량/기사 범위로 축소된다.
- 확인됨: 최신 차량 위치는 원시 이벤트 전체가 아니라 `list_latest_operational_staff_locations` RPC 결과에서 읽는다.
- 보류(TMS 02): RPC가 “업무 중 위치만” 반환한다는 DB 함수 본문 및 운영 적용 상태, 차량 교체·기사 대타 회귀는 이 PR에서 판정하지 않는다.
- 충돌(TMS 02): 지도 폴링의 `localDateKey()`는 브라우저 로컬 시간대를 사용하지만 PR #106은 업무 날짜를 Asia/Seoul로 고정한다. 날짜 규칙 소유 PR에서 API·서버 KST 처리와 함께 고친다.
- 충돌 가능성 없음: PR #106은 문서 1개, PR #99·#100은 지도 파일 비변경이다. PR #103은 `lib/store.ts`를 수정하므로 이번 PR은 해당 파일을 건드리지 않는다.

## 회귀·롤백

- 유지 동작: 같은 폴링 주기, 같은 API, 같은 접속 감지, 같은 6초 표시, 같은 위치·완료 상태 공유.
- 추가 동작: 접속 알림을 `role=status`, `aria-live=polite`로 안내한다.
- 롤백: `MapVehicleConnectionToast` 호출을 기존 인라인 마크업으로 되돌리면 된다. DB·API 롤백은 없다.
