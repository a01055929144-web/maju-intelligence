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
- 다만 `lib/store.ts`의 `getDeliveryHistoryForDate`가 `route_plan_confirmations`가 없는 날짜는 "현재 등록된 담당자 배정"으로 추정 표시함 — 과거 실제 배정과 다를 수 있음을 UI에 명시했는지 재확인 필요.

## FIXED (2026-09-12)
- **증상**: 지도 탭에서 "전체 리드 보기"를 켜면 지도가 텅 빈 것처럼 보임(마커/값이 안 불러와지는 것처럼 보임). 하단 리드 목록에서 특정 매장을 클릭하면 그제서야 지도에 나타남(사용자 보고: "영업 리드 선택할때 지도랑 값들이 안불러와져", "여전히 안나와, 아래 하단에 리드 매장 선택하면 그때 보여지네").
- **Root Cause**: `components/kakao-address-map.tsx`의 `bootMap`이 지도에 그려진 **모든** 마커(거래처 + 전체 리드)를 하나의 `LatLngBounds`에 합쳐 `map.setBounds(bounds)`로 화면을 맞춤. "전체 리드 보기"는 반경 제한이 없어 최대 1,000건의 리드가 전국에 흩어져 있을 수 있는데, 이 리드들까지 초기 화면 맞추기 계산에 포함되면서 지도가 극단적으로 축소되어(스크린샷 기준 축척 128km) 마커가 전부 점처럼 보여 사실상 빈 화면처럼 보임. 데이터 자체는 정상 수신됨("1,000/1,000곳 표시 중" 카운터는 정확했음) — 순수 지도 뷰포트 계산 버그였고 API/DB 문제는 아니었음.
- **Trigger**: 지도 탭에서 "전체 리드 보기" 토글 ON, 활성 리드가 여러 시군구/전국에 걸쳐 있을 때.
- **Impact**: 지도(`/dashboard`) 탭의 "리드" 서브뷰에만 영향. "반경 리드"(반경 제한 검색)는 애초에 지리적으로 좁게 모여 있어 영향받지 않음(사용자도 보고하지 않음). 코스/히스토리 탭은 이 마커 소스를 쓰지 않아 무관.
- **Fix**: `KakaoMapMarker` 타입에 `excludeFromAutoBounds?: boolean` 필드 추가. `sales-route-map-workspace.tsx`의 `allLeadsMapMarkers`(전체 리드 보기 마커 빌더)에만 `excludeFromAutoBounds: true`를 설정하고, `leadRadiusMapMarkers`(반경 리드)는 그대로 둠. `kakao-address-map.tsx`의 `bootMap`은 이제 `bounds`(전체, 마커 클릭 이동 등 기존 용도 유지)와 별도로 `primaryBounds`/`primaryFound`(제외 플래그 없는 마커만)를 함께 계산해, 화면 맞추기 시점(초기 `map.setBounds(...)` 분기, 120ms 지연 재조정)에는 `primaryFound > 0`이면 `primaryBounds`를 우선 사용하도록 변경. 리드 마커 자체는 계속 지도에 그려지고, 클릭 시 기존처럼 `focusedMarkerId` 경로로 정상 이동함 — 단지 "자동으로 어디까지 화면을 맞출지" 계산에서만 제외됨.
- **Regression Risk**: 낮음. 거래처만 있고 "전체 리드 보기"가 꺼져 있으면 `primaryFound === found`라 기존과 동일하게 동작. 코스(road path) 화면 맞추기는 항상 `bounds`(전체)를 그대로 사용해 변경 없음. 리드 좌표가 유효하지 않아 `primaryFound === 0`인 극단적 케이스(거래처 하나도 없이 리드만, 그마저 좌표 없음)에서는 기존처럼 `bounds` 전체로 폴백.
- **Test Scenario(사용자 확인 필요)**: 지도 탭 진입 → "리드" 서브뷰에서 "전체 리드 보기" ON → 별도 리드 클릭 없이 곧바로 지도에 거래처/리드 마커가 합리적인 축척으로 보이는지 확인. 이후 리드 하나 클릭 시 여전히 그 위치로 정상 이동하는지, "반경 리드" 모드는 기존과 동일하게 동작하는지, 코스/히스토리 탭 회귀 여부도 함께 확인.
- **Verification**: 클라우드 클론에서 `npx tsc --noEmit` PASS, `npm run build` PASS(`/dashboard`, `/map/fullscreen`, `/routes/today` 라우트 정상 포함). `C:\maju-deploy`에서 `node ebcheck_tmp2.js`로 두 파일 모두 OK, `git show HEAD`와의 중괄호/괄호/대괄호 균형 비교로 구조적 정합성 확인. 두 저장소(`C:\maju-deploy`, 클라우드 클론)의 diff가 git blob 해시(줄바꿈 방식 차이) 외에는 완전히 동일함을 확인. **다만 실제 브라우저에서 지도 렌더링을 시각적으로 확인하지는 못했음 — 사용자 테스트 필요.**
- **Files**: `components/kakao-address-map.tsx`, `components/sales-route-map-workspace.tsx` (둘 다 `push-latest.bat`의 `git add` 목록에 이미 포함되어 있음, 추가 조치 불필요).

## FIXED (2026-09-12, 2차 — 지역 시군구 필터)
- **증상**: 지도 "리드 전체 필터"의 "지역" 드롭다운(시군구 선택)에 일부 리드의 지역 값이 아예 안 나타나거나("시군구 전체"를 고르면 보이는데 특정 시군구를 고르면 사라짐), 드롭다운 자체에 의미 없는 "시" 한 글자짜리 항목이 뜨는 경우가 있음(사용자 보고: "지역 시군구 필터가 값이 제대로 안들어 간 경우가 있어").
- **Root Cause**: `components/sales-route-map-workspace.tsx`의 `parseLeadRegion()`은 주소 문자열에서 시/도 접두어를 뗀 뒤 그다음 토큰이 (시|군|구)로 끝나야 시군구 값으로 인정합니다. 세종특별자치시는 우리나라에서 유일하게 시/도 바로 아래에 시/군/구 단위 없이 읍/면/동으로 바로 이어지는 광역 행정구역이라, "세종특별자치시 한누리대로 ..."처럼 정식 명칭으로 시작하는 주소는 접두어를 뗀 다음 토큰이 "한누리대로"/"조치원읍" 같은 도로명·읍면동이라 (시|군|구)에 안 걸려 시군구 값이 항상 빈 문자열이 됨 — 그 결과 이 리드는 지역 드롭다운에 나타나지 않고, 다른 지역을 고르면 목록에서도 조용히 빠짐. 더 나쁘게는 축약형 "세종시 ..."로 시작하는 주소는 접두어 패턴이 "세종"까지만 떼어내(원문이 "세종특별자치시"가 아니라 "세종시"라 전체 일치가 안 됨) 남은 "시" 한 글자가 (시|군|구)로 끝나는 토큰으로 오인식되어 의미 없는 "시" 항목이 드롭다운에 생김. 실제 데이터/API 문제가 아니라 정규식 기반 근사 파싱이 세종만 놓치는 순수 문자열 처리 버그였음.
- **Trigger**: 세종특별자치시(세종시) 소재 리드가 있고, 지도 "리드 전체 필터"의 "지역" 드롭다운을 사용할 때.
- **Impact**: 지도(`/dashboard`) 탭의 "리드" 서브뷰 지역 드롭다운에만 영향. 세종 외 다른 모든 시/도는 시/군/구 단위가 항상 존재해 영향 없음(코드 재검토로 확인).
- **Fix**: `parseLeadRegion()` 진입부에 세종 전용 분기(`SEJONG_PREFIX_PATTERN`, "세종특별자치시"/"세종시"/"세종" 형태 모두 인식)를 추가해, 세종 주소는 시/군/구를 더 파싱하려 하지 않고 곧바로 sigungu="세종특별자치시"로 반환하도록 함.
- **Regression Risk**: 낮음. 새 분기는 주소가 "세종"으로 시작할 때만 타고, 그 외 지역은 기존 로직 그대로 유지. 도로명에 우연히 "세종"이 포함되는 경우(예: 다른 시/도의 "세종로")는 주소 맨 앞이 아니라 시/도 접두어 뒤에 오므로 이 분기와 무관.
- **Test Scenario(사용자 확인 필요)**: 세종 소재 리드가 있는 상태에서 지도 "전체 리드 보기" 켜고 지역 드롭다운을 열어 "세종특별자치시" 항목이 정상적으로 뜨는지, 선택 시 세종 리드만 정상적으로 필터링되는지 확인.
- **Verification**: 클라우드 클론에서 `npx tsc --noEmit` PASS, `npm run build` PASS, `npm test`(vitest 28건) 전부 PASS. Node로 `세종특별자치시 ...`/`세종시 ...`/`세종특별자치시 조치원읍 ...` 등 샘플 주소를 직접 실행해 올바른 결과 확인. `C:\maju-deploy`에서 `node ebcheck_tmp2.js` OK, `git show HEAD` 대비 중괄호/괄호/대괄호 균형 비교로 구조적 정합성 확인, 두 저장소 diff가 완전히 동일함을 확인.
- **Files**: `components/sales-route-map-workspace.tsx` (`push-latest.bat` git add 목록에 이미 포함).
