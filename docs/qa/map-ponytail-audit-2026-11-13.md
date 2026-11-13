# 지도 파일 Ponytail 점검 보고 (CC-45-1, 2026-11-13 main `638fa6d`)

> 코드 변경 0줄. 지시서 `docs/dispatch/2026-11-13-map-ponytail-audit.md` 45-1. **컨트롤타워 검토 후 45-3 순서 확정.**
>
> **점검 범위(솔직히)**: 세 파일(`components/sales-route-map-workspace.tsx` 11,468줄 · `kakao-address-map.tsx` 1,766줄 · `today-course-view.tsx` 1,312줄)을 **정적 집계 + 핵심 지점(fetch 31곳·효과 의존성·지도 생성·공용 계산·다른 파일의 가져오기) 직접 읽기**로 점검했다. 14,546줄을 줄 단위로 다 읽은 것은 아니다 — 아래 "확인 필요"로 표시한 항목은 45-2(e2e)·45-3 분리 중 읽으면서 확정한다. 도구: `grep` 집계, `npx tsc --noUnusedLocals`(세 파일 미사용 지역 변수 0건), `npx eslint`(세 파일 경고 6건·오류 0).

## 한눈에

| 지표(`sales-route-map-workspace.tsx`) | 값 |
| --- | --- |
| 줄 수 | 11,468 (메인 컴포넌트 `SalesRouteMapWorkspace` 481~3997 = **약 3,500줄**, 나머지는 한 파일에 든 하위 컴포넌트·도우미) |
| `useState` / `useEffect` / `useMemo` / `useCallback` / `useRef` | 258 / 38 / 61 / 7 / 14 |
| `fetch(` | 31 · **`AbortController` 0** · 요청 순서 보호가 있는 곳은 외부 사업자 검색 효과 1곳뿐(`cancelled` 플래그, 1160) |
| `eslint-disable` | 3 (1037 · 1822 · 10359) — 모두 효과 의존성 경고를 끈 것 |
| 주석 줄 | 514(4.5%) · "2026-08-24 피드백…", 시안·TODO류 서술 117줄 |
| 다른 파일이 이 파일에서 가져가는 것 | 9개 파일(아래 R7) |

## 1. 버그·위험 (심각도 · 근거 · 영향)

| # | 심각도 | 내용 | 근거(줄) |
| --- | --- | --- | --- |
| R1 | **P2** | **필터·보기를 바꿀 때 지도가 통째로 다시 만들어지고 화면이 맞춰진다(CC-42a 원인).** 지도 생성 효과의 의존성에 `markersSignature`(마커 목록 서명)가 들어 있어 마커가 바뀌면 효과가 다시 돌며 `mapRef.innerHTML = ""` → `new kakao.maps.Map` → `mapViewportReadyRef=false; refitViewportRef=null`로 위치·확대를 잃는다. | `kakao-address-map.tsx` 421~460(생성) · **681**(`[appKey, canUseKakao, markersSignature, routePath, salesAreaBoundary?.province]`) |
| R2 | **P2** | **오래된 응답이 새 결과를 덮는다(요청 순서 보호 없음).** 리드 전체 불러오기 `loadAllLeadsForMap`은 필터(`showOutsideSalesAreaOnMap`·`mapLeadAreaRange`·`mapTargetType`)가 바뀔 때마다 효과로 불리는데 취소·순서 확인이 없어 **나중에 도착한 응답이 이긴다** — 빠르게 필터를 바꾸면 마지막으로 누른 필터와 다른 결과가 남을 수 있다. 반경 탐색 `runMapLeadRadiusSearch`도 같다. | `sales-route-map-workspace.tsx` 905~931(`loadAllLeadsForMap`) · 1031(`[showAllLeadsOnMap, …]`) · 852~873(반경 탐색) |
| R3 | P3 | 검색어 효과는 `allLeadsLoadState === "idle"`일 때 **한 번만** 리드를 불러오고(`[query]`, 의존성 경고를 끔) 그 뒤 필터가 바뀌어도 이 경로는 다시 안 부른다 → 검색 결과의 리드가 켜 둔 필터와 어긋날 수 있다(위 R2의 다른 효과가 `showAllLeadsOnMap`일 때만 다시 부름). **확인 필요(e2e로 재현)** | 1033~1038 |
| R4 | **P2 (확인 필요)** | **회사 범위가 URL 쿼리에 의존.** 리드 API 호출은 `withPermitLeadCompanyQuery`가 `window.location`의 `?companyId=`를 호출 시점에 읽어 붙인다(관리자 미리보기용). 서버는 세션으로 최종 판정하지만, (a) `companyId`가 바뀐 채 컴포넌트가 다시 만들어지지 않으면 `allLeadsForMap` 등 **이전 회사 데이터가 상태에 남는지** 코드로 확인하지 못함, (b) CC-39로 관리자·운영 세션이 함께 있으면 서버는 `x-maju-site` 헤더로 범위를 고르므로(헤더는 자동 부착) 지도 호출은 문제없지만 **이 도우미가 3개 다른 컴포넌트에서도 쓰임**. → 45-2 e2e에 "관리자 미리보기에서 회사 전환" 케이스 추가 권장 | 8976~8984 · 사용처 `instagram-candidate-finder`·`lead-change-history`·`permit-leads-view` |
| R5 | P3 | **카카오 지오코딩 반복 호출.** `geocodeAddresses`는 한 번의 호출 안에서만 중복을 제거하고 **호출 사이 캐시가 없다** → 길찾기 메뉴를 열 때마다 서버 `/api/routes/geocode`를 다시 부른다. 서버 쪽 한도·캐시는 이 점검에서 읽지 않음(**확인 필요**). | 5112~5123 · `NavigateMenu` 5131 |
| R6 | P3 | **한 컴포넌트에 상태 258개 → 같은 개념의 상태가 여럿**(예: `previewLeadId`·`focusedMarkerId`·선택 id류)이라 서로 덮어쓸 위험. 예: 반경 탐색 결과가 오면 `setRightPanelTab("leads")`로 **사용자가 보던 탭을 강제로 바꾼다**. 필터·선택·포커스가 서로 덮어쓰는 구체적 경로는 45-2 e2e로 기록한 뒤 분리하며 정리. | 868 외 |
| R7 | **P2** | **큰 파일이 사실상 공용 라이브러리 노릇.** 9개 파일이 이 파일에서 함수·타입을 가져간다(`withPermitLeadCompanyQuery`, 리드 유형·등급·신뢰도·견적 도우미, `StoreRow`·`RouteMetric`·`PermitLead*` 타입 등). 분리할 때 먼저 도메인으로 옮기고 **옛 경로에서 다시 내보내기(re-export)** 를 두지 않으면 가져오는 쪽이 한꺼번에 깨진다. | `delivery-history-view`·`instagram-candidate-finder`·`lead-change-history`·`lead-contact-channels-panel`·`lead-stage-select`·`mobile-sales-workspace`·`permit-leads-view`·`today-course-view`·`kakao-address-map` |
| R8 | P3 | 견적 초안·편집 캐시가 **브라우저 localStorage**에 남는다(`saveQuoteDraftToLocal`, `loadEditCacheWithTtl` 7542·464, 6곳) — 공용 PC에서 거래처·견적 정보가 남을 수 있음(CC-39 "모든 로그인 해제"와 별개로 저장소는 안 지워짐). 사용자 키로 분리돼 있는지 **확인 필요**. | 464 · 7535~7552 |
| R9 | P3 | 경고 6건(오류 0): 효과 의존성 누락 4(`loadAllLeadsForMap` 1031, `StoreDetail` 5416, `gradeSortWeight` 6969, `today-course-view` 198), `<img>` 2(10277·10413). 의존성 경고는 R2·R3와 같은 뿌리 — **끄지 말고 분리하며 고친다.** | `npx eslint` |

## 2. 죽은 코드·중복

- **미사용 지역 변수·함수: 0건**(`tsc --noUnusedLocals`). 죽은 코드는 "안 쓰는 선언"이 아니라 **서술 주석과 옛 흐름의 흔적** 쪽이다.
- **거리 계산(haversine) 5곳에 따로 있음**: `lib/route-map-utils.ts`(공용, 이 파일이 가져다 씀), `kakao-address-map.tsx:1255`(미터), `delivery-history-view.tsx:56`(km), `lib/place-links.ts`(미터), `domains/delivery/staff-location.ts`. → `domains/route/distance.ts` 한 곳으로(단위 km·m 변환만 얇게).
- **주석이 역사 서술**: 514줄 중 117줄이 "2026-08-24 피드백: …"류 → 의도(왜)만 남기고 정리(45-3 각 단계에서 옮기며).
- **같은 계산 여러 곳 후보**(분리하며 확인): 마커 만들기·리드 유형 판정(`getPermitLeadType` 8945)·등급 색(`permitGradeToneClassName` 8968)은 지도·목록·카드에서 각각 호출하는 것으로 보임(`permit-leads-view`도 가져감).

## 3. UI 안에 있는 업무 규칙 → 옮길 목록

| 지금 위치(줄) | 내용 | 옮길 곳 |
| --- | --- | --- |
| 8932 `isPermitLeadUnscored` · 8945 `getPermitLeadType` · 8986 `getPermitLeadOpenDate` · 8992 `isPermitLeadInOpenDateFilter` · 9012 `formatLeadOpenDateFilterLabel` | 리드 유형·개업일 필터 규칙 | `domains/lead/map-filters.ts` |
| 7655 `getLeadConfidence` · 6549 `sortLeadList` · 7772~7800 `extractDistrictToken`·`getRecommendedDelivery` | 신뢰도·정렬·추천 배송 | `domains/lead/` · `domains/route/` |
| 7556 `normalizeLeadSearchToken` · 7580 `parseLeadRegion` · 7601~7640 인스타 핸들·검색 토큰 | 검색어·지역·핸들 해석 | `domains/lead/search.ts`(CC-45 P3 검색어 정리와 같이) |
| 7481 `inferIndustryFromText` · 7489 `resolveDisplayIndustry` · 7501~7550 견적 초안 만들기 | 업종 추정·견적 초안 | 기존 `domains/lead/industry-classification.ts` 재사용 + 견적 도메인 |
| 7699~7715 `buildOutboundItemNotes`·`buildLeadDmScript`·`buildQuoteShareText` | 문구 만들기 | 기존 `domains/lead/dm-template.ts` |
| 9037~9190 `matchPermitHeaderField` 등 | 인허가 엑셀 머리글 매칭 | `domains/lead/` (가져오기 규칙) |
| 5112 `geocodeAddresses` · 2215 거리 일괄 | 지오코딩·거리 호출 | `hooks/use-map-data.ts`(45-3g) + 캐시 |

## 4. 분리 지도 (45-3 단위 ↔ 상태·함수·줄 범위)

| 단계 | 새 위치 | 가져올 것(줄 범위, 근사) | 예상 크기 |
| --- | --- | --- | --- |
| **a** | `components/map/map-search-results-panel.tsx` (CC-42b를 여기서) | 메인 안의 검색 상태(`query`·외부 검색 1160~1180·`externalResults`)·결과 목록·일괄 등록(`QuickRegisterDrawer` 3997~4212 + 메인의 등록 핸들러) | 500~800줄 |
| **b** | `components/map/map-filters-bar.tsx` + `domains/lead/map-filters.ts` | 필터 칩·프리셋(`/api/map/filter-presets` 939~1000)·URL 동기화(`applyFromLocation` ~1800~1822, `MapExplorerTabs` 4254)·규칙 함수 8932~9037 | 600~900줄 |
| **c** | `components/map/map-side-panel.tsx` | `SplitListTabs` 4290 · `LeadListPanel` 6576~6880 · `CustomerDirectoryView` 6880~7481 · `PermitLeadMapQuickCard` 7804~8160 · `StoreQuickCard` 5295~5798 · `StoreDetail` 9269~9988 | 3,000줄 안팎(가장 큼 — 둘로 나눔 권장: 목록 / 상세·미리보기) |
| **d** | `components/map/map-markers.ts` + `domains/route/markers.ts` | 마커 만들기·등급/유형 색·번호 핀(`MapLayerControl` 5883·`MapLayerLegend` 5942, 메인의 `markers` 만들기 `useMemo`) | 300~500줄 |
| **e** | `components/map/vehicle-layer.tsx` | `LiveVehicleStatusPanel` 6057~6203 · `VehicleAnalysisModal` 6203~6365 · `VehicleMasterManager` 4825~4986 · `AddDriverForm` 4986 · `VehicleEditForm` 5978 · 차량 배정 `DeliveryAssignmentPanel` 4326~4825 | 1,500줄 안팎 |
| **f** | `components/map/route-planner.tsx` + `domains/route/*` | 코스·거리(`/api/routes/batch-distance` 2215)·길찾기(`NavigateMenu` 5131~5250 · `FullRouteNavigateAction` 5250 · `geocodeAddresses` 5112)·`RouteBasisStrip` 10647 · haversine 통합 | 600~900줄 |
| **g** | `hooks/use-map-data.ts` | **fetch 31곳**(852·919·939·969·994·1006·1046·1067·1081·1164·1937·2016·2041·2074·2123·2150·2169·2215·4430·4853·4889·5115·5386·7051·7060·7095·7927·8246·8267·8300·8401) → 한 곳에서 **취소·요청 순서 보장**(R2·R3 해결) | 400~700줄 |
| 그 밖 | 견적 `QuoteDrawer` 8160~8932(약 770줄)·견적 도우미 7481~7556 → `components/map/quote-drawer.tsx`(지시서 표에 없음 — 추가 제안) · 첨부·편집 행 10213~10647(약 430줄) → `components/map/store-attachments.tsx` | 각 400~800줄 |

목표 `sales-route-map-workspace.tsx` ≤ 2,000줄(조립만): 위 분리를 다 하면 메인 3,500줄 + 남는 도우미가 줄어 **달성 가능**하나, **c(사이드 패널)를 둘로 나누고 견적·첨부를 추가로 빼야** 2,000줄 아래로 내려간다.

## 5. 고칠 순서 · 크기 · 심각도 요약

1. **45-2 e2e 안전망**(분리 전 필수): 아래 R1·R2·R3·R4를 재현하는 케이스를 **지금 동작 그대로** 기록(필터 빠르게 두 번 → 마지막 결과, 필터 바꿔도 지도 위치 유지(현재는 실패하는 기준선이므로 `fixme`로 표시하고 42a에서 켠다), 관리자 미리보기 회사 전환).
2. **42a**(작은 수정, `kakao-address-map.tsx`만): 지도 생성 효과 의존성에서 `markersSignature`·`routePath` 제거 → **마커 레이어만 교체**, 화면 맞춤은 첫 진입·"전체 보기"·검색 이동 때만. (R1, P2, 약 100~200줄 변경)
3. **45-3a(=42b)** → b → c(분할) → d → e → f → **g**(R2·R3의 근본 해결은 g에서 — a~f 중에는 새 파일 안의 fetch에만 `AbortController`/순서 확인을 도입하고 기존 31곳은 g에서 한꺼번에).
4. 도메인 이동(3절)은 각 단계에서 함께, **옛 경로 re-export를 두어 가져오는 9개 파일이 안 깨지게**(R7). 마지막 단계에서 가져오는 쪽을 새 경로로 바꾸고 re-export 제거.
5. haversine 통합·주석 정리·경고 6건 해소는 f·각 단계에서.

| 심각도 | 항목 |
| --- | --- |
| P2 | R1 지도 재생성 · R2 요청 순서 · R4 회사 범위(확인) · R7 큰 파일 결합 |
| P3 | R3 · R5 지오코딩 호출 · R6 상태 중복 · R8 로컬 저장 · R9 경고·haversine 중복·주석 |
| P0·P1 | **발견 없음**(데이터 손실·보안 우회로 이어지는 경로는 이 점검 범위에서 못 찾음 — 단 R4·R8은 확인이 끝나기 전까지 보류 판정) |

## 컨트롤타워에 묻는 것

1. 45-3c(사이드 패널 ~3,000줄)를 **목록 / 상세·미리보기** 둘로 나눠도 되는지, 견적(`QuoteDrawer`)·첨부 분리를 45-3에 추가해도 되는지.
2. R4(회사 전환 시 이전 회사 상태 잔존)를 45-2 e2e에서 먼저 재현해 보고 심각도를 확정해도 되는지.
