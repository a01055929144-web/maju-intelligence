# R1 추가 지시 — Claude Code (2026-11-11 01:30 대표 화면 확인)

Codex 사용량 소진으로 CX-05를 Claude Code로 옮기고, 편집 화면 열 문제를 새로 붙인다. 순서: **CC-10 → CC-09**. Ponytail은 Claude Code의 ponytail-review로 직접 점검(`Ponytail: 사용함 (Claude Code ponytail-review)`).

## CC-10 문서 편집 화면 "한 줄에 2열·3열"이 1열로 보임 (P1)

- **현상(대표 화면, 1920px)**: 오른쪽 설정에서 `2열` 선택 상태인데 편집 종이 안 품목이 1열로만 나온다. `3열`도 반영 안 됨.
- **원인(컨트롤타워 코드 확인)**: `components/pricing-doc-paper.tsx` 품목 영역이 `gridTemplateColumns: repeat(auto-fit, minmax(min(100%, 260px), 1fr))`. 3단 화면(상품 목록·종이·설정) 가운데 종이 폭이 약 490px라 260px 칸이 2개 들어가지 않아 자동으로 1열이 된다. 선택한 열 수(`display.columns`)를 격자에 쓰지 않는다.
- **Files**: `components/pricing-doc-paper.tsx`만(+ 테스트). **Do Not Touch**: 미리보기·인쇄(`pricing-document-preview.tsx`, `printPages`) — CC-09.
- **Required**: 화면 폭 641px 이상에서는 `repeat(${columns}, minmax(0, 1fr))`로 선택한 열 수를 그대로 쓴다. 휴대폰(≤640px)은 지금처럼 1열. 열이 좁아도 품목명·규격은 줄바꿈, 단가는 오른쪽 고정(3열에서 글자가 칸 밖으로 나가지 않게). 편집용 휴지통 칸 폭 유지.
- **Done**: 1·2·3열 전환 시 편집 종이 열 수가 바뀌는 e2e(PC 1440·1920, 모바일 390), CI 초록, Ponytail.

## CC-09 (구 CX-05 후속) 인쇄 미리보기 A4 빈 공간 — 배포 후 실측 확인 (P0)

- **현상(대표 화면 01:30, 운영 `6b9cb2b`)**: 2열·130%에서 A4 1쪽에 열마다 7줄 정도만 들어가고 아래 절반 이상이 비며 "1 / 2쪽"으로 넘어간다.
- **상태**: 그 직후 01:32 Codex 초안 **#484가 병합**됐다(`9f52875`). `printPages`가 "줄 무게 3·한도 26" 추정에서 **글자 폭·A4 가용 높이 기반 행 높이 추정**으로 바뀌었고 여백도 10mm로 줄었다. 대표 화면은 #484 이전 버전이다.
- **할 일**: ① 다음 배포 뒤 1·2·3열 × 100/115/130%에서 1쪽 채움률을 실제 화면으로 잰다(Playwright로 각 열 마지막 행 bottom ÷ 가용 높이). ② 85% 이상이면 표·PNG만 PR(테스트 추가)로 남기고 끝. ③ 미만이면 추정 대신 **숨은 측정 영역의 실제 행 높이**로 쪽을 나누도록 바꾼다(순수 함수 "행 높이 배열 + 가용 높이 + 열 수 → 쪽 나눔"은 domains에 두고 단위 테스트).
- **Files**: `components/pricing-document-preview.tsx`, `domains/pricing/document.ts`(`printPages`)·신규 순수 함수 + 테스트, `tests/e2e/pricing-document-actions.spec.ts`. **Do Not Touch**: 편집 종이(CC-10).
- **Done**: 채움률 표(전/후), PNG(1·2·3열, 휴대폰), CI 초록, Ponytail.

## CC-15 미리보기·인쇄·공개 문서의 "과세/면세" 글자 — 오른쪽 설정 옵션으로 (11/11 08:27 대표 · P1)

- **현상**: 편집 종이에는 없는 "면세/과세" 글자가 미리보기·A4 인쇄·공개 링크 문서의 **모든 품목 아래**에 붙는다. 대표가 켠 적 없는 표시.
- **원인(컨트롤타워 코드 확인)**: `components/pricing-document-preview.tsx`가 표시 설정과 상관없이 항상 그린다 — 92·105·123·149·152행 `data-document-tax`(`l.taxType === "exempt" ? "면세" : "과세"`). 11/08 `a0a701e`에서 생겼고 11/11 #484(CX-05)가 A4 칸 배치를 바꾸며 단가 아래로 옮겨 더 눈에 띄게 됐다. 편집 종이(`pricing-doc-paper.tsx`)에는 없어 **편집 ≠ 인쇄**. 76행 바닥 문구 "면세 품목 별도 표시"도 항상 붙는다.
- **Required**:
  1. `domains/pricing/document.ts` `DocumentDisplay`에 `showTaxType: boolean` 추가, `DEFAULT_DISPLAY`는 **false**, 정규화에서 값 없는 기존 문서·버전도 false(기존 발행본 다시 열어도 글자 사라짐 — 가격 계산은 그대로).
  2. 오른쪽 설정 `components/pricing-info-panel.tsx` "품목 표 › 표시 단가(부가세 별도/포함)" 바로 아래에 **"과세·면세 표시 [숨김 | 표시]"** 칩. 편집 불가 상태에선 비활성.
  3. `pricing-document-preview.tsx`의 5곳 + 바닥 문구 "· 면세 품목 별도 표시"를 `display.showTaxType`일 때만. 편집 종이 `pricing-doc-paper.tsx`도 켜면 단가 아래 같은 글자(편집 = 인쇄).
  4. 표 보기의 과세 구분 열(입력용)과 "과세 미확정" 경고는 **그대로**(편집 도구라 대상 아님). 엑셀 내보내기 열도 그대로.
- **Files**: 위 4개 파일 + `tests/e2e/pricing-spec-flow.spec.ts`(139~141·181행: 기본은 0개, 옵션 켠 경우 16개로 나눠 검증) + 단위 테스트(정규화 기본 false).
- **Done**: 기본 숨김·켜면 미리보기/A4/공개 링크/편집 종이 모두 표시 e2e(PC 1440·390), 기존 버전 열람 시 숨김, CI 초록, Ponytail. 순서: #516·#518 뒤 바로.
