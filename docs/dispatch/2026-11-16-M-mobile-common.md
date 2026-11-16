# M 모바일 UI/UX 공통화 — 기사 · 매장 · 고객사 직원 (2026-11-16 18:58 대표)

> "ui/ux 모바일은 공통으로 진행해야 해. 고객사 기사도 있고, 매장도 있고"
> 표 공용화(CC-47)처럼 **한 곳을 고치면 세 화면이 같이 바뀌게**. 담당: 공통 부품 = **Claude Code(CC-52)**, 화면 적용 = 화면 주인 방.

## 1. 지금 (11/16 main)

| 누가 | 화면 | 파일 |
| --- | --- | --- |
| **기사** | 오늘 코스 · 배송 처리 · 완료 사진 · 위치 보고 | `app/mobile/today` · `today-course-view` · `mobile-route-list` · `mobile-route-action-panel` · `mobile-delivery-proof-panel` · `mobile-loading-attachment-panel` · `mobile-location-reporter` · `mobile-map-summary` |
| **고객사 영업 직원** | 영업 · 거래처 등록 · 견적 · 방문 기록 | `app/mobile/sales`·`register` · `mobile-sales-workspace` · `mobile-register-workspace` · `mobile-quote-builder` · `mobile-visit-note-form` · `mobile-accordion-step` |
| **매장(점주·직원)** | 매장 홈·주문·내역·정보·구성원 · 공유 문서 | `app/store/*` · `store-*`(약 20개) · `storefront-*` · `public-pricing-document` · `pricing-document-preview` |

문제: 하단 메뉴 2벌(`mobile-bottom-navigation`·`mobile-sales-bottom-navigation`) · 화면 틀 2벌(`mobile-theme-shell`·`store-app-shell`) · 글자 크기·버튼 높이·숫자 표기가 화면마다 다름 · 공유 문서는 인쇄 배치를 휴대폰에 그대로(CX-45) · `components/ui`에 모바일 부품 없음.

## 2. 모바일 공통 기준 (`docs/standards/mobile-ui.md`로 CC-52가 정식 문서화)

| 항목 | 기준 |
| --- | --- |
| 폭 | 768px 미만 = 모바일. **한 단(1열)** 기본, 표는 카드형 목록으로 |
| 글자 | 본문 15px · 보조 13px · 제목 18px · **금액 16px 굵게, 고정폭 숫자, 줄바꿈 금지** · 상품명·상호 `break-keep` 최대 2줄 · 입력칸 16px 이상(iOS 확대 방지) |
| 누르는 곳 | 최소 44px, 주 버튼 48px, 버튼 사이 8px 이상. hover로만 보이는 동작 금지 |
| 화면 틀 | 위: 뒤로 + 제목 + 동작 1개까지 · 아래: **하단 메뉴(역할별 항목)** 또는 **고정 주 버튼 1개**(둘 중 하나) · 아이폰 하단 안전 영역(`safe-area-inset-bottom`) |
| 목록 한 줄 | 2줄: 이름(굵게) + 오른쪽 금액/상태 / 아래 회색 보조 정보. 행 높이 56~72px |
| 고르기·확인 | 모바일은 가운데 창 대신 **아래에서 올라오는 시트**(공용 `Dialog`의 모바일 모양). 지우기 확인은 공용 `useConfirm` |
| 검색 | 공용 `SearchInput`, 목록 위 고정 |
| 상태 | 로딩·빈·오류는 공용 `state.tsx`, 저장 결과는 `notice.tsx` |
| 숫자·날짜 | `formatWon`·`formatNumber`·`formatKstDate` 그대로, 숫자 입력은 `inputMode="numeric"`(수량)·`"decimal"`(무게) |
| 느린 연결(기사) | 버튼 누르면 바로 "처리 중" 표시 · 실패하면 다시 시도 버튼(입력 내용 유지) · 사진은 올리기 전 줄여서 |
| 분위기 | CX-44 디자인 기준과 같음 — 이모지·그라데이션·광고체 없이 담백하게, 회사 대표 색 1개 + 회색 |

## 3. 작업

| ID (담당) | 할 것 | DB |
| --- | --- | --- |
| **CC-52** (Claude Code) | **모바일 공용 부품** `components/ui/mobile/`: `MobileShell`(위 머리·안전 영역) · `BottomNav`(역할별 항목 받기 — 기사/영업/매장 하나로) · `BottomActionBar`(고정 주 버튼) · `MobileListRow`(2줄 행) · `BottomSheet`(공용 `Dialog` 모바일 모양) · `MoneyText`(금액 한 줄 고정) · 기준 문서 `docs/standards/mobile-ui.md` · 단위 시험·e2e(390) · **기존 하단 메뉴 2벌을 `BottomNav` 하나로 바꾸기**(두 파일 소유가 Claude Code·지도 쪽이라 같이) | 없음 |
| **CC-52b** (Claude Code) | 영업 직원 모바일에 적용: `mobile-sales-workspace`·`mobile-register-workspace`·`mobile-quote-builder`·`mobile-visit-note-form` | 없음 |
| **CX-46** (Codex 01) | 기사 모바일에 적용: `app/mobile/today` 계열 8개 파일(1절 표) — 동작 변화 없음, 느린 연결 기준 | 없음 |
| **CX-47** (Codex 09) | 매장 모바일에 적용: S-5·S-6·S-4·CX-45를 **처음부터 공용 부품으로**(이미 병합된 S-1·S-7 화면은 CX-47에서 바꿈) | 없음 |

순서: **CC-52 먼저**(부품 + 기준) → CC-52b · CX-46 · CX-47 동시. CC-52 병합 전에는 09방 S·CX-45는 진행하되 **새 모바일 부품을 각자 만들지 않는다**(나중에 CC-52 부품으로 바꾸기 쉽게 화면 안에서만).

**표도 공통(대표 11/16 19:32)**: PC 표는 매장·고객사 직원 모두 `components/common-data-table.tsx` 하나를 쓴다(매장 PC 주문 표 포함 — S 문서 2-4 ④). 표마다 필요한 기능(예: 수량 편집 칸)은 공용 표에 더하고, 화면에서 따로 표를 만들지 않는다.

## 4. 완료 기준

- `components/ui/mobile/` 부품 6개 + 기준 문서 병합, 하단 메뉴 1벌.
- 기사·영업·매장 대표 화면 각 1개씩 390 캡처를 한 PR 본문 표에 나란히(같은 머리·하단·행·버튼 모양인지 대표 확인).
- 재집계: 모바일 화면에서 직접 만든 하단 메뉴·고정 버튼·시트 0(예외는 `// shared-ui-exception:` 주석).
- 기존 e2e 통과, 기대값 수정 금지(위치만 바뀐 셀렉터는 이유 적기).
