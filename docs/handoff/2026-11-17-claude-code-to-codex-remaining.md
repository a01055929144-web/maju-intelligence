# Claude Code → Codex 인수인계: 남은 작업지시 정리 (2026-11-17)

작성: Claude Code. 대상: Codex 컨트롤. 근거: `docs/dispatch/2026-11-17-R7-claude-code.md` · `R8-claude-code.md` 와 이번 세션 병합 기록.
규칙은 R2 · R4 그대로(Hobby `maxDuration` ≤ 60 · 공용 표/모바일 부품 · 병합은 CI 전부 초록 + 보드 `| 진행 중` 0줄 · 지도는 Claude Code 소유였음 · `lib/store.ts`는 03).

## 0. 끝난 것 (이 문서 이후 다시 하지 않기)

| 항목 | PR |
| --- | --- |
| CC-59 가는 길에 넣기(스위치 `ROUTE_SALES_STOPS` 기본 OFF) | #953 |
| CC-60 공공데이터 수집 상태 · CC-68 "새 행 없음(지역 n곳 확인)" | #945 · #1034 |
| CC-61 업종 칩 · 배송/사업장 주소 두 줄 | #961 |
| CC-62 · CC-66 배포 전 화면 점검 · 와이어프레임 대조 표 | #981 (`docs/dispatch/2026-11-17-CC-62-66-predeploy-and-wireframe.md`) |
| CC-63 정류장 사진 · CC-64 알림 부품 · CC-65 가는 길 영업 결과 | #967 · #969 · #971 |
| CC-67 지도 배송 이력 · 오늘 코스 정류장 기준 카드(추가형) | #983 |
| CC-72 매입가 업로드 결과 카드 · 저장 방식 라디오 · 새 상품 중복 의심 선택 필수 | #1003 |
| CC-73 첫 조각: 공용 거래처 틀 `components/partners/partner-directory.tsx` · 매입처 이전 · 매출처 "통합 화면"(`/crm/timeline?section=partners`) | #1016 |
| CC-70 일부: 매출처 원장 수정 사업자 정보 칸 + 같은 사업자번호 안내 | #1040 |
| CC-69 | #987은 운영 회귀로 되돌림(#992), 핫픽스 #994 · #995로 해결 |

## 1. 남은 작업 (우선순위 순)

### T1. CC-70 나머지 화면 — 지도 거래처 상세 · 모바일 등록 · 매장 정보 패널
- Objective: 사업자 상호 · 종사업장번호(숫자 4자리) · 개인/법인 · 법인등록번호(13자리)를 지도 거래처 상세 편집, 모바일 거래처 등록, 매장 정보 패널에도 같은 칸으로.
- **선행(03, `lib/store.ts` 소유)**: `getTodayRoutePlan`이 만드는 `RoutePlanStop`(그리고 `StoreRow`)에 `businessName` · `subBusinessNumber` · `businessEntityType` · `corporateRegistrationNumber`를 실어야 한다. 지금은 안 실려 지도 상세에 칸을 넣으면 기존 값이 비어 보이고 **저장 시 빈 값으로 덮어쓸 위험**. 선행 없이 칸만 추가 금지.
- Files(선행 뒤): `components/map/map-place-detail.tsx`(편집 draft `saveDraft` · `onUpdateStore` 본문), `components/sales-route-map-workspace.tsx`(StoreRow → PATCH `/api/customers` 본문 매핑 ~1811 · ~3494), `components/mobile-register-workspace.tsx`, `components/store-information-panel.tsx`(매장 쪽은 `store_profiles` — 거래처 칸과 다른 테이블, CX-58 `store_profiles` 3칸 기준).
- 재사용: `components/partners/business-identity-fields.tsx`(`BusinessIdentityFields` · `businessIdentityBlocked`), `domains/partner/business-identity-notice.ts`(같은 사업자번호 안내 · 13자리 검사), `domains/partner/directory.ts`(`parseSubBusinessNumber`). 서버 검사는 `domains/customer/business-identity.ts`(CX-59).
- 규칙: 같은 사업자번호 + 종사업장번호가 모두 다르면 저장 허용(안내만), 같거나 한쪽 비면 막고 "중복 허용 사업자번호에 추가"(설정 › 고급 `BusinessNumberExceptionsPanel`) 링크.
- 추가 표시: 상세 · 전표 미리보기에 "사업자 상호 · 종사업장 0002" 작은 글. 공용 표 열 편집에 "사업자 상호" · "종사업장번호" 기본 숨김 열(매출처 목록은 `components/partners/partner-directory.tsx`가 이미 열을 가짐 — 다른 표에 추가).
- Do Not Touch: 날짜별 저장 RPC · DB · 서버 저장 경로(CX-59).
- Completion: 단위 시험 · 가짜 API e2e(같은 사업자번호 + 다른 종사업장 두 매장 등록 성공 · 같으면 막힘) · 1440 · 390.

### T2. 매입처 사업자 정보 칸
- `product_suppliers`에 사업자 상호 · 종사업장 · 개인/법인 · 법인등록번호 칸이 없음 → **03이 SQL 초안**(CX-58과 같은 이름 · 같은 체크, nullable, down + PG17) → 대표 승인 → 적용 뒤 `components/product-supplier-workspace.tsx`의 `SupplierProfileCard`에 `BusinessIdentityFields` 연결, 매입처 목록 열(`PartnerRow.businessName/subBusinessNumber`)에 값 채움. 그 전까지 매입처 쪽 새 칸은 숨김(지금 상태).

### T3. CC-73 이어서 — 매출처 기존 화면을 공용 틀 안으로(Strangler)
- 지금: 매출처는 기존 큰 화면(`app/crm/timeline/page.tsx` 3,400+줄)을 **대체하지 않고 새 섹션 `?section=partners`만 추가**. 매입처는 이미 틀로 이전.
- 할 것: 매출처 상세 탭(기본 정보 · 품목/단가 · 전표 · 원장 · 메모)에 기존 원장 폼 · 기록 · 지도 연결을 옮김(영업 타임라인 · 지도 · 영업 단계는 추가 탭 유지), 메뉴 이름 · 주소(`/crm/timeline`, `/purchasing/suppliers`)는 변경 금지. 비즈니스 규칙은 domain에 두고 틀은 UI만.
- 목록 열 값 채우기: 매입처는 미지급금 · 이번 달 거래액이 "-"(목록 단위 데이터 없음) — 집계 API가 필요하면 03/해당 domain 방에 요청. 매출처 "이번 달 거래액"은 `monthlyRevenue` 어림.
- 시험: 같은 틀 렌더 시험은 `tests/partner-directory.test.tsx`, e2e `tests/e2e/partner-directory.spec.ts`(매출처는 가짜 `/api/customers`에 `visitCount` 등 페이지 필수 필드 필요).

### T4. `[전표 쓰기]` 거래처 미리 선택 — 전표 화면 소유 방
- 틀은 `/operations/documents?partnerType=&partnerId=(&companyId=)`로 연다(`partnerDocumentHref`). **전표 화면(`app/operations/documents/page.tsx` · `components/business-document-workspace.tsx`)이 이 값을 아직 읽지 않아** 거래처가 미리 선택되지 않음. 쿼리를 읽어 새 전표 · 목록 필터 초기값으로.
- 확인할 것: 전표 링크를 열 때 브라우저 콘솔에 보인 CORS 오류(`/operations/documents?...` → `/leads?type=permit` 리다이렉트로 보임) 원인.

### T5. CC-67 후속 — 정류장 기준으로 **교체**(03)
- 지금 지도 "배송 이력" · "오늘 코스" 위에 정류장 카드만 추가(`components/route-stops-timeline.tsx` · `GET /api/route-stops`). 기존 목록 · 경로 계산은 `lib/store.ts`(`getTodayRoutePlan` · 배송 이력 조회)가 `route_plan_confirmations.customer_ids`로 계산. 03이 이를 `delivery_route_stops` 우선 읽기로 바꾸면 카드를 목록으로 흡수.
- 주의: `/api/route-stops`는 담당 거래처 범위로 거르지 않음(회사 범위만) — 기사 계정에 열기 전 범위 제한 필요. 정류장 사진 쓰기(`delivery_route_stop_photos`)가 아직 main에 없어(CX-53 확인) 사진 카드는 이전 방식으로 보임; 사진 서명은 거래처 첨부와 같은 비공개 버킷 가정(`app/api/customers/delivery-stop-photos/route.ts` `shortcut:` 표시).

### T6. CC-69 후속 (P3) — 지도 칸이 잠깐 빠지는 이유
- 컨트롤타워 핫픽스 #994 · #995의 감시 · 재시도는 **그대로 둔다**. 할 일은 원인 표(Symptom · Root Cause · Trigger)만: SDK 로드 사이 `mapRef`가 왜 잠깐 빠지는지(부모 다시 그리기 vs 패널 전환). 운영에서만 재현, CI에는 카카오 키가 없어 지도 부팅 e2e 불가.
- 참고: 내가 시도한 #987(부팅 effect deps에서 `salesAreaBoundary?.province` 제거)은 운영에서 영역이 비는 회귀 → 되돌림. 같은 방식 재시도 금지.

### T7. CC-62 반복 — 배포 전 화면 점검
- 방법: 병합된 main을 `CI_LAYOUT_FIXTURES=enabled`(+ `playwright.config.ts` webServer env)로 로컬 빌드·실행 → 로그인(`ci-owner@example.test`) → 12개 화면 × 1440 · 390 오류 수 · 가로 넘침 · 최종 주소 측정 + 스크린샷 확인. 결과 표는 `docs/dispatch/2026-11-17-CC-62-66-predeploy-and-wireframe.md` 형식. 지도는 CI에서 카카오 SDK가 없어 "지도 연결 확인 필요"로 보이는 것이 정상.

## 2. 켜지지 않은 스위치 · 배포 후 대표 확인 (코드 완료, 화면 미확인)

- `ROUTE_SALES_STOPS`(기본 OFF, 회사 allowlist `FEATURE_ROUTE_SALES_STOPS_COMPANY_IDS`): 리드 상세 [가는 길에 넣기](CC-59), 지도 리드 목록 "단가표 전달 n일 전 · 열어봄"(CC-65). 켜기 전에는 안 보임이 정상. 켠 뒤 확인: 오늘 · 내일 기사별 "+N분", 넣은 뒤 기사 화면 점선 칸.
- 대표 Chrome 확인 필요(이번 세션 전부 실제 화면 미확인): 지도 핀 · 저장 좌표 · 카카오내비(실제 폰) · 열린 상세 ← → · 정류장 사진 · 열 정렬 결과 카드와 저장 방식 라디오(CC-72) · 새 상품 중복 의심 저장 차단 · 매출처 "통합 화면" · 매입처 새 틀 · 원장 수정의 사업자 정보 · 수집 상태 "새 행 없음".
- 근사치 주의: 가는 길 "+N분"은 직선거리 ÷ 25km/h 어림(`domains/lead/route-insert.ts`, `shortcut:` 표시) · 정류장 번호 밀기는 여러 요청이라 중간에 끊기면 번호 빈 칸(순서 유지).

## 3. 알려진 한계 · 주의 (코드에 `shortcut:` 표시 있는 것 포함)

- CC-72 "기존 상품에 연결"은 `/api/price-sheets/links` 직접 호출이 아니라 기존 "이 상품으로 연결"(저장 때 원문 연결 기록) 경로. 중복 의심 줄마다 고르기 강제 e2e는 기존 Stage A 테스트 안의 선택 단계로만 확인.
- CC-72로 기존 테스트 선택자 변경: `② 열 정렬`은 `/^② 열 정렬/`, "현재 가격도 변경"은 checkbox → radio (`tests/e2e/purchase-cost-atomic-batch.spec.ts` · `tests/integration/stage-a.spec.ts`).
- CC-68 지역 수 n은 기록 `metadata.areas` 길이. areas가 비면 "지역 0곳 확인"으로 보일 수 있음.
- CC-70 같은 사업자번호 안내는 화면에 불러온 매출처 목록 기준(잘린 대형 회사는 서버 검사가 최종).
- 병합 규칙 사고 기록: #929는 배포 잠금 중 병합됨(이후 모든 병합을 `[ "$(...grep -c '^| 진행 중')" = 0 ] && gh pr merge`로 한 명령에 묶음).
- 도구 메모: 로컬 `tsc --noEmit`은 `Set` · `Map.values()` 펼침 오류를 놓친 적이 있어 `Array.from` 사용. ci.yml 새 e2e는 기존 `npm run test:e2e:layout -- …` 줄에 파일명만 추가(Python으로 편집, sed는 줄 끝 문자 때문에 실패한 적 있음). 새 e2e는 CI에서 처음 돌므로 가짜 API 데이터에 페이지가 쓰는 필수 필드를 빠뜨리지 말 것(`/crm/timeline`은 `visitCount` 없으면 렌더 오류).
