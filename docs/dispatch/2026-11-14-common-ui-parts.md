# CC-47 공통 화면 부품 정리 (2026-11-14 22:4x 대표 결정)

> 컨트롤타워 작성 · 담당 Claude Code(ponytail-review). 대표 요청: "공통 표처럼 공통 검색창도 정리 — 공통으로 적용하면 효율이 높아지는 것 정리해서 진행".
> 기준 코드: main `82d56fc`(#770). 숫자는 이 시점 `app/`·`components/` `.tsx` grep 결과(테스트 제외 아님 — 대략치).
> 이 문서는 지도 지시서 [`2026-11-14-map-final.md`](2026-11-14-map-final.md)의 "지도 화면 3건"(검색창 × · 마커 상호명 · 목록 순번)을 **대신한다**. × 는 47-1에 들어간다.

## 0. 원칙

- **부품마다 같은 순서**: ① 부품 하나 만들기 + 가장 많이 쓰는 곳(공통 표·지도) 적용 → ② 나머지 화면을 묶음 PR로 옮기기 → ③ 컨트롤타워가 체크리스트 "공통 화면 기준"에 올려 새 화면은 처음부터 부품 사용.
- 옮기는 PR은 **동작 변화 없음**(부품이 새로 주는 것 — × 버튼, Esc 닫기 등 — 만 생김). 화면마다 쓰던 Enter·디바운스·URL 동기화·단축키는 유지.
- 부품 위치: 화면 부품은 `components/ui/`, 날짜·금액 같은 순수 함수는 `domains/shared/`(비즈니스 규칙 아님, 기술 서식만 — CLAUDE.md 11-7). domains는 lib·React를 import하지 않는다.
- 작업 전 `gh pr list`로 Codex 열린 PR(지금 #450 매장 연결 해제)과 파일 겹침 확인. 겹치면 그 PR 병합 뒤로.
- 화면을 바꾸는 PR은 `npm run test:e2e:layout`(1440·390). map-baseline·layout 기대값은 고치지 않는다(깨지면 부품 쪽을 고침).
- 기능 PR은 현황판·체크리스트를 고치지 않는다. 배포 잠금 중 병합 멈춤. 새 e2e는 `ci.yml` 목록에 추가. 본문 첫 줄 Ponytail.

## 1. 현황 (재검증 22:4x)

| # | 항목 | 지금 | 이미 있는 공용 것 | 문제 |
| --- | --- | --- | --- | --- |
| 1 | 검색칸 | 52곳 · 39파일 각자 | `maju-search-field` CSS(7파일만) · 공통 표 안 검색칸(모양 다름: 아이콘 없음·h-9) | × 지우기 없음, 모양·높이 제각각 |
| 2 | 확인 창 | `window.confirm` 59곳 · 38파일 | 지도 파일 안 지역 함수 `ConfirmDialog`(export 안 됨) | 브라우저가 "대화상자 더 표시 안 함"을 붙이면 이후 confirm이 조용히 false → **삭제 버튼이 반응 없는 것처럼 보임**(2026-08-24 배송담당자 삭제 사례, 지도 파일 3718줄 주석) · 위험 동작 구분 없음 · 휴대폰 문구 잘림 |
| 3 | 팝업 틀(모달·서랍) | `fixed inset-0` 19파일(25곳), `role="dialog"` 16파일 | 없음 | Esc 닫기 5파일뿐 · 뒤 화면 스크롤·포커스 새어 나감 · 닫기 방식 제각각 |
| 4 | 날짜·"오늘" | 한국 날짜 구하는 방법 5가지 이상(`+9h` 이동 · `Intl en-CA` · `toKstDateKey` · `kstDateKey` · `kstDateTime`) | 공용 없음 | **UTC로 '오늘'을 구하는 곳이 남아 있음 → 한국 00:00~08:59에 하루 전 날짜** (아래 4-1) |
| 5 | 로딩·빈 목록·오류 | "불러오는 중" 86곳·49파일, "~없습니다" 108곳·49파일 | `InlineLoading`(3파일) · `maju-empty-state` CSS(9파일) | 다음 행동 안내 있는 곳/없는 곳 섞임, 오류 표시 없는 화면 있음 |
| 6 | 저장 결과 알림 | `aria-live` 69곳·52파일 각자 | 지도 차량 연결 토스트(전용) | 위치·색·사라지는 시간 제각각, 실패에 "다시 시도" 없음 |
| 7 | 표 | `<table>` 직접 33파일 | `CommonDataTable`(16파일) | 33곳은 검색·번호·엑셀·인쇄·열 편집·키보드 없음 |
| 8 | 금액·숫자·전화 | `toLocaleString(...)원` 직접 20곳+ · 인자 없는 `toLocaleString()` 429곳 · 전화 정리 정규식 7파일 | `formatWon`(1파일 사용) · `lib/phone.ts` | 표시 형식 제각각 |
| 9 | 복사 버튼 | `navigator.clipboard` 23파일 | `CopyTextButton`(2파일) | 완료 문구 "복사했습니다"(26)·"복사됨"(4) 섞임 |
| — | 그 밖(급하지 않음) | `<select>` 167곳·71파일 · 페이지 넘기기 14파일 · 필터 칩 14파일 | — | 1·7이 정리되면 대부분 그 안에서 해결 |

### 4-1. UTC '오늘' 실제 위치 (P2 — 데이터·표시가 하루 틀림)

| 파일 | 영향 |
| --- | --- |
| `domains/product/catalog-import.ts` 308·439, `lib/product-catalog-import.ts` 319 | 날짜 없는 상품 가져오기 → `price_date`·`last_seen_date`가 한국 오전 9시 전엔 **어제로 저장**(데이터) |
| `components/permit-leads-view.tsx` 657 | "후속 일정만" 필터가 오늘 일정을 오전 9시까지 안 보여 줌 |
| `components/mobile-sales-workspace.tsx` 509 | 후속 일정 입력 최소 날짜가 어제 |
| `app/dashboard/settings/staff-management-panel.tsx` 904·1044 | 날짜 입력 최소값이 어제 |
| `components/churn-risk-alert.tsx` 27·38 | "오늘 그만 보기"가 오전 9시에 풀림 |
| `app/page.tsx` 4273 · `app/admin/uploads/workspace.tsx` 107 | 내려받기 파일 이름 날짜(경미) |
| `app/quote/[token]/page.tsx` 33 (서버 화면) | 견적서 "유효기간"을 서버(UTC) 기준으로 그림 → 날짜만 저장된 값은 하루 틀릴 수 있음(확인 필요) |

※ `+9h` 이동 후 자르는 곳(`domains/pricing/document.ts` 136, `customer-item-import.ts` 20)과 `YYYY-MM-DD` 검증용 `T00:00:00Z` 비교는 맞게 동작 — 공용 함수로 바꾸기만.

## 2. 작업 (순서대로, 한 PR = 한 단계)

| ID | 이름 | 할 것 | 동작 변화 |
| --- | --- | --- | --- |
| **47-1** | 공통 검색창 + 지도 + 공통 표 | `components/ui/search-input.tsx` `SearchInput` — 돋보기 · 값 있을 때만 오른쪽 ×(aria-label "검색어 지우기", 휴대폰 44px) · Esc = 지우기 · × 뒤 포커스 입력칸 유지 · 브라우저 기본 × 숨김(`::-webkit-search-cancel-button`) · size `sm`(h-9)/`md`(h-10) · props `value/onChange/onClear/placeholder/aria-label/size/className/children`(최근 검색어 펼침 자리). 모양은 `maju-search-field` 기준으로 하나. **적용**: 지도 상단 검색칸(`onClear = closeSearch` → M2b 이전 위치 복귀 그대로, 최근 검색어는 children) · `CommonDataTable` 검색칸(`/` 단축키·`data-table-search` 유지) | × 생김 |
| **47-2** | 지도 화면 2건 | ① 거래처 마커 상호명 알약: 등급별 `[C] 상호` · 차량별 `[1] 상호`(차량 색, 미배정 "미", title "1호차"/"미배정") · level ≥ 7 축소 시 배지만(`computeCompact` 재사용) · 숫자만 원(`/^\d+$/` 분기)은 앞으로 배송 순서 전용 · ✓·선택 강조·M2b 핀·z-index·#770 위치 추정(≈·점선) 유지. ② 지도 오른쪽 거래처/신규/영업 목록 상호명 왼쪽 순번 — 공통 표 번호 칸 모양(`text-right text-xs tabular-nums text-slate-400` + `rowNumber()`)을 `RowNumber`(또는 `maju-row-number`) 하나로 빼서 표·목록 같이 사용. 검색 결과 번호 핀·오늘 코스 순서 번호는 그대로 | 있음(대표 요청) |
| **47-3** | 한국 날짜 함수 + UTC '오늘' 고침 | `domains/shared/kst-date.ts`: `kstToday()`(YYYY-MM-DD) · `kstDateKey(value)` · `formatKstDate(value, "short"|"long"|"datetime")`(예: `11/14(토)`, `2026. 11. 14.`, `11/14(토) 22:38`) · `isIsoDate(text)`. 4-1 표의 UTC '오늘'을 전부 교체 + 흩어진 한국 날짜 함수 5종을 이것으로(동작 같게). 테스트: 한국 00:30·08:59·09:00 경계(가짜 시계) | 있음(버그 수정) |
| **47-4** | 확인 창 + 팝업 틀 | `components/ui/dialog.tsx` `Dialog`(Esc·바깥 누르기·× 닫기, 포커스 가둠·복귀, 뒤 스크롤 잠금, 휴대폰 전체 화면 옵션) · `components/ui/confirm-dialog.tsx` `useConfirm()` → `await confirm({ title, body, confirmLabel, tone: "danger" })`(지도 파일 지역 `ConfirmDialog`를 승격). 적용: 삭제·거래 종료·발행 같은 위험 동작 먼저(`window.confirm` 59곳 중 삭제 계열), 모달은 Esc 없는 14파일부터 | Esc·포커스 생김 |
| 47-5 | 상태 화면 3종 | `components/ui/state.tsx` `LoadingState` · `EmptyState`(문구 + 다음 행동 버튼 자리) · `ErrorState`(문구 + 다시 시도). `InlineLoading`·`maju-empty-state` 흡수. 적용: 공통 표 빈·로딩 칸 + 주요 목록(거래처·리드·주문함·단가) | 오류·빈 안내 생김 |
| 47-6 | 저장 결과 알림 | `components/ui/notice.tsx`(성공 초록·실패 빨강 + 다시 시도, 같은 위치·같은 시간, `aria-live` 한 곳) · 화면 안 고정 문구형과 잠깐 뜨는 토스트형 2가지만 | 모양 통일 |
| 47-7 | 금액·전화·복사 | 있는 것 쓰기: `formatWon`(+ `formatNumber`를 `domains/shared/money.ts`에) · `lib/phone.ts` · `CopyTextButton`(완료 문구 "복사했습니다"로 통일) | 없음 |
| 47-8 | 남은 검색칸·확인 창 옮기기 | 47-1·47-4 부품으로 나머지 화면을 묶음별 2~3 PR(단가·상품·매입 / 매장·주문 / 관리자·설정·CRM 기타). 끝나면 grep으로 직접 구현 0곳(남기면 이유) 보고 | × 생김 |
| 수시 | 직접 만든 표 → 공통 표 | 33파일. 그 화면을 고칠 때마다 하나씩(CC-13·12와 같은 방식). 한 번에 하지 않음 | 표 기능 생김 |

순서: **47-1 → 47-2 → 47-3 → 지도 M4 → 47-4 → 47-5 → 47-6 → 47-7 → 47-8**. 47-3은 실제 날짜 오류라 47-1·47-2 다음에 바로(작음). M4(지도 측면 패널 분리)는 47-2가 끝난 뒤.

## 3. 완료 기준 (부품마다)

- 부품 단위 테스트(가짜 값만, 실제 전화·주소·상호 금지) + 적용 화면 e2e 1개 이상(PC 1440·휴대폰 390).
- `npx tsc --noEmit` · `npm run lint` · `npm test` · `npm run build` · `npm run check:auth-boundaries` 초록.
- PR 본문: 바꾼 곳 수(전/후 grep 숫자), 남긴 곳과 이유, 동작 변화 목록.
- 실제 화면 확인 못 한 것은 "확인 못 함"으로 적기(배포 후 대표 확인).

## 4. 컨트롤타워 할 일

- 47-1 병합 뒤: 체크리스트 "공통 화면 기준"에 공통 검색창 추가(이후 부품마다 같은 방식). 단계 체크(A~F) 분모에는 넣지 않음.
- 47-3 배포 뒤: 운영에서 한국 오전 9시 전 상품 가져오기 날짜 확인(읽기 조회) — 이미 어제로 저장된 행이 있는지 세기만, 고치기는 대표 승인 대상.
