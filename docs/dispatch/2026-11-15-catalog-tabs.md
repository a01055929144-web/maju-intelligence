# CC-49 카탈로그 화면 탭 나누기 + 비교표 정리 (2026-11-15 18:41 대표 의견)

> "카탈로그 비교 왜 있는 건지 잘 모르겠고, 카탈로그 안에 많은 기능들이 있어 보여 탭으로 구분해서 보기 편하게"
> 담당: **Codex 03방 = CX-32** ([R2 Codex](2026-11-15-R2-codex.md)). Owner Domain: pricing · Related: store(매장 연결).

## 1. 지금 화면 (`/revenue/pricing/catalog`) — 한 페이지에 8덩어리가 세로로 쌓임

| # | 덩어리 | 파일 | 문제 |
| --- | --- | --- | --- |
| A | 카탈로그 고르기(카드/표·매장 많은 순·+ 새 카탈로그) | `pricing-margin-templates.tsx` | |
| B | 고른 카탈로그 고치기(이름·기본 마진·끝자리·대분류/분류별 마진·저장·보관) | 같은 파일 | A를 누르면 그 아래에 열려 화면이 길어짐 |
| C | **카탈로그 비교(불러온 상품 앞 20개)** | 같은 파일 129~137행 | ① 왜 이 20개인지 알 수 없음(정렬·폴더와 무관, 첫 쪽 앞 20개) ② 카드의 "기본 대비 +2.9%"와 B의 미리보기가 이미 같은 정보 ③ 이 표 때문에 정작 쓰는 판매가 표가 화면 아래로 밀림 |
| D | 매장별 카탈로그 연결 표 | `catalog-store-link-table.tsx` | 카탈로그 정하기와 매장 배정이 같은 자리 |
| E | 반영 안 된 변경 n개 · 지금 반영 · 직전 반영 되돌리기 | `price-sheets-workspace.tsx` | |
| F | 기본 마진 + 단가표 만들기 | 같은 파일 | |
| G | **판매가 표**(폴더·폴더 마진) — 가장 많이 쓰는 것 | `pricing-sales-price-table.tsx` · `pricing-folder-margin.tsx` | A~D 아래에 있어 스크롤해야 보임 |
| H | 고급: 마진 그룹 직접 관리 | `pricing-margin-groups.tsx` | |

## 2. 바꿀 모양 — 위 탭(카탈로그 · 행사·임박 · 매장 가격) 아래에 칩 탭 4개

공용 `components/ui/tabs.tsx`의 `Tabs variant="chip"`(위 밑줄 탭과 모양이 달라 두 단계가 구분됨). 선택은 URL `?view=`와 맞춤(새로고침·뒤로가기 유지, 잘못된 값은 기본 탭).

| 탭 (`view`) | 담는 것 | 비고 |
| --- | --- | --- |
| **판매가** (`prices`, 기본) | E 반영 줄 · F 기본 마진 한 줄(+ 단가표 만들기) · G 판매가 표 | 들어오자마자 판매가 표가 보임. 표 위에 **"카탈로그로 보기: [기본 ▾]"** 고르기 1개 — 기본이 아닌 카탈로그를 고르면 표에 `이 카탈로그 판매가`·`차이(%)` 두 칸이 붙음(전체 상품·지금 폴더·정렬 그대로). **C 비교표를 이것으로 대신** |
| **카탈로그** (`catalogs`) | A 고르기 + B 고치기 + 미리보기(바뀌는 상품 n개·평균 차이) | 카드에서 `판매가 보기` 누르면 `?view=prices&catalog=<id>`로 이동 |
| **매장 연결** (`stores`) | D 매장별 카탈로그 표 | 위 탭 "매장 가격"(매장별 개별 가격)과 헷갈리지 않게 탭 안 첫 줄에 한 줄 설명: "어느 매장이 어떤 카탈로그 가격을 쓰는지 정합니다. 매장 하나만 따로 값을 바꾸려면 '매장 가격'" |
| **마진 그룹** (`groups`) | H 그대로(접기 없이 펼침) | 탭 이름 옆 `고급` 작은 표시 |

- 카탈로그 스위치(`MARGIN_TEMPLATES`)가 꺼진 회사: `카탈로그`·`매장 연결` 탭 숨김(`판매가`·`마진 그룹`만), `카탈로그로 보기` 고르기도 숨김.
- **C 비교표 삭제.** 같은 계산(`templatePrice`)을 판매가 표 칸에서 씀 — 계산은 `domains/pricing`의 기존 순수 함수 재사용, 새 계산 만들지 않음.
- 성공·오류 알림은 탭마다 따로 두지 말고 화면 위 한 곳(지금 `Notice`·`ErrorState`).
- 모바일(390): 칩 탭 가로 스크롤, 판매가 표의 추가 두 칸은 지금 표의 모바일 규칙을 따름.

## 3. 작업 (한 PR = 한 단계)

| ID | 할 것 | DB |
| --- | --- | --- |
| **49-1** | 칩 탭 4개 + URL `?view=` + 덩어리 옮기기(동작 변화 없음, C는 아직 둠) | 없음 |
| **49-2** | 판매가 표 "카탈로그로 보기" + 두 칸 + C 비교표 삭제 + 카드 `판매가 보기` 연결 | 없음 |

## 4. Files (CX-32 = 03방만 고침)

`app/revenue/pricing/catalog/page.tsx` · `components/price-sheets-workspace.tsx` · `components/pricing-margin-templates.tsx` · `components/catalog-store-link-table.tsx` · `components/pricing-sales-price-table.tsx` · `components/pricing-margin-groups.tsx` · `components/pricing-folder-margin.tsx` · 새 파일은 `components/pricing-catalog-*.tsx` · 테스트.
→ `pricing-sales-price-table.tsx`·`pricing-margin-groups.tsx`는 **CX-26에서 빼서 CX-32로** 옮김(같은 파일 동시 수정 방지). 두 파일의 공용 부품 옮기기(확인 창·원 서식)도 CX-32에서 같이.

Do Not Touch: `components/ui/**`(탭 부품 고치지 않음 — 부족하면 멈추고 보고) · `lib/store.ts` · `domains/pricing` 계산 규칙(읽기만) · API(`/api/price-sheets`·`/api/margin-templates`) 응답 모양 · 위 탭 `pricing-tabs.tsx` · 행사·매장 가격 화면.

## 5. Test · 완료 기준

- 단위: `view` 값 읽기(잘못된 값 → `prices`), 스위치 꺼짐 → 탭 2개.
- e2e(1440·390, 가짜 API): 들어오면 판매가 표가 첫 화면에 보임 · 탭 전환 후 새로고침해도 같은 탭 · `카탈로그로 보기: 양식` → 표에 두 칸, 차이 % 표시 · 비교표 없음. 기존 가격 e2e 통과(기대값 수정 금지 — 위치만 바뀐 셀렉터는 탭 클릭 추가로 맞춤, PR 본문에 이유).
- PR 본문: 전/후 화면(1440) · "실제 화면 확인 못 함(배포 후 대표 확인)".
- 검증 순서·Ponytail·squash·배포 잠금 확인은 R2 Codex 0절·0-1절.
