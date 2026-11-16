# 모바일 UI 공통 기준 (CC-52)

출처: [M 모바일 공통화](../dispatch/2026-11-16-M-mobile-common.md) 2절 · [D-3 기사 화면](../dispatch/2026-11-16-D3-driver-ux.md) 0절. 기사 · 영업 직원 · 매장이 같은 부품을 쓴다. 부품은 `components/ui/mobile/`.

## 기준

| 항목 | 기준 |
| --- | --- |
| 폭 | 768px 미만 = 모바일. 한 단(1열), 표는 카드형 목록 |
| 글자 | 본문 15px · 보조 13px · 제목 18px · 금액 16px 굵게 고정폭 숫자 줄바꿈 금지 · 입력칸 16px 이상 |
| 누르는 곳 | 최소 44px, 주 버튼 48px, 버튼 사이 8px 이상, hover로만 보이는 동작 금지 |
| 화면 틀 | 위: 뒤로 + 제목 + 동작 1개 · 아래: 하단 메뉴 또는 고정 주 버튼 1개(둘 중 하나) · `safe-area-inset-bottom` |
| 목록 한 줄 | 2줄(이름 굵게 + 오른쪽 금액/상태 / 아래 회색 보조) · 행 높이 56~72px |
| 고르기·확인 | 가운데 창 대신 아래에서 올라오는 시트. 지우기 확인은 `useConfirm` |
| 상태 | 로딩·빈·오류 `state.tsx`, 저장 결과 `notice.tsx` |
| 숫자·날짜 | `formatWon`·`formatNumber`·`formatKstDate`, 수량 `inputMode="numeric"`, 무게 `"decimal"` |
| 느린 연결 | 누르면 바로 "처리 중" · 실패 시 다시 시도(입력 유지) · 사진은 올리기 전 줄임 |

## 부품 (`components/ui/mobile/`)

| 부품 | 용도 |
| --- | --- |
| `MobileShell` | 화면 틀: 위 머리(뒤로·제목·동작 1개) + 본문 + 아래 영역 |
| `BottomNav` | 하단 메뉴 하나(기사·영업·매장 공용). 항목·가운데 큰 버튼은 호출하는 쪽이 준다. `trackHash`로 한 화면 안 `#` 이동 표시 |
| `BottomActionBar` | 고정 주 버튼 1개(48px, 처리 중 표시) |
| `MobileListRow` | 2줄 목록 행 |
| `BottomSheet` | `mode="modal"`: 뒤를 막는 아래 올라오는 창(Esc·포커스 가둠). `mode="docked"`: 지도 위에 붙는 시트, 높이 작게·중간·크게(`height`, 손잡이 `onHeightChange`) |
| `MoneyText` | 금액 한 줄 고정 |
| `SlideToConfirm` | 밀어서 처리. 같은 동작의 일반 버튼이 함께 있다(포커스를 받으면 보임 — 키보드·화면 읽기 프로그램) |

## 쓰는 법

- 모바일 화면에서 하단 메뉴 · 고정 버튼 · 시트를 직접 만들지 않는다. 불가피하면 그 줄 위에 `// shared-ui-exception: <이유>`.
- 되돌릴 수 없는 동작(운행 종료 · 문제 보고)만 확인을 받고, 나머지는 `SlideToConfirm` 또는 바로 실행 + 되돌리기.
- 분위기: 이모지 · 그라데이션 · 광고체 없이 담백하게, 대표 색 1개 + 회색.
