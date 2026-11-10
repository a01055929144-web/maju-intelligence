# R1 추가 지시 — Claude Code (2026-11-11 01:30 대표 화면 확인)

Codex 사용량 소진으로 CX-05를 Claude Code로 옮기고, 편집 화면 열 문제를 새로 붙인다. 순서: **CC-10 → CC-09**. Ponytail은 Claude Code의 ponytail-review로 직접 점검(`Ponytail: 사용함 (Claude Code ponytail-review)`).

## CC-10 문서 편집 화면 "한 줄에 2열·3열"이 1열로 보임 (P1)

- **현상(대표 화면, 1920px)**: 오른쪽 설정에서 `2열` 선택 상태인데 편집 종이 안 품목이 1열로만 나온다. `3열`도 반영 안 됨.
- **원인(컨트롤타워 코드 확인)**: `components/pricing-doc-paper.tsx` 품목 영역이 `gridTemplateColumns: repeat(auto-fit, minmax(min(100%, 260px), 1fr))`. 3단 화면(상품 목록·종이·설정) 가운데 종이 폭이 약 490px라 260px 칸이 2개 들어가지 않아 자동으로 1열이 된다. 선택한 열 수(`display.columns`)를 격자에 쓰지 않는다.
- **Files**: `components/pricing-doc-paper.tsx`만(+ 테스트). **Do Not Touch**: 미리보기·인쇄(`pricing-document-preview.tsx`, `printPages`) — CC-09.
- **Required**: 화면 폭 641px 이상에서는 `repeat(${columns}, minmax(0, 1fr))`로 선택한 열 수를 그대로 쓴다. 휴대폰(≤640px)은 지금처럼 1열. 열이 좁아도 품목명·규격은 줄바꿈, 단가는 오른쪽 고정(3열에서 글자가 칸 밖으로 나가지 않게). 편집용 휴지통 칸 폭 유지.
- **Done**: 1·2·3열 전환 시 편집 종이 열 수가 바뀌는 e2e(PC 1440·1920, 모바일 390), CI 초록, Ponytail.

## CC-09 (구 CX-05 이관) 인쇄 미리보기 A4 빈 공간·쪽 나눔 (P0)

- **현상(대표 화면, 2열·130%)**: A4 1쪽에 열마다 7줄 정도만 들어가고 아래 절반 이상이 비어 있으며 나머지는 다음 쪽으로 넘어간다(“1 / 2쪽”).
- **원인**: `domains/pricing/document.ts` `printPages`가 실제 높이 대신 추정 무게로 쪽을 나눈다. 줄 무게 최소 3, 한도 `26 × 열 ÷ 글자배율` → 2열·130%에서 한 쪽 약 13줄(열당 6~7줄). 실제로는 열당 13줄 이상 들어간다.
- **방향**: 추정 상수 조정이 아니라 **실제 렌더 높이로 나눈다** — 화면 밖 숨은 측정 영역에 같은 A4 폭·글자 배율로 행을 그린 뒤 `getBoundingClientRect` 높이로 열·쪽을 채운다(열은 위에서 아래로 채우고 다음 열로). 측정 전 첫 렌더는 지금 방식으로 대체. 순수 함수는 "행 높이 배열 + 쪽 가용 높이 + 열 수 → 쪽 나눔"으로 domains에 두고 단위 테스트.
- **함께**: 원래 CX-05 요구(휴대폰 미리보기 1열·가독성, 미리보기 창 상단 겹침, 여백 10~12mm) 중 남은 것.
- **Codex 초안 #484**(`codex/CX-05-a4-print-density`, Draft): 먼저 읽고 쓸 만한 부분(테스트 등)을 가져와 이 작업 PR에 합친 뒤, #484는 "CC-09로 이관" 댓글 후 닫는다. 새 PR은 하나만.
- **Files**: `components/pricing-document-preview.tsx`, `domains/pricing/document.ts`(`printPages`)·신규 순수 함수 파일 + 테스트, `tests/e2e/pricing-document-actions.spec.ts`. **Do Not Touch**: 편집 종이(CC-10).
- **Done**: 1·2·3열 × 100/115/130%에서 1쪽 채움률 표(전/후, 목표 85% 이상), 대표 화면과 같은 품목 수(합성 데이터)로 2열 100%가 1쪽에 들어가는 e2e, PNG(1·2·3열, 휴대폰) PR 첨부, CI 초록, Ponytail.
