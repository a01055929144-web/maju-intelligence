# Claude Code 이관 인수인계 — 2026-11-10 20:30 KST

이 문서 하나로 Claude Code가 MAJU 작업을 이어받는다. 규칙은 `CLAUDE.md` 1절·`AGENTS.md`, 진행 현황은 `docs/work-orders/2026-11-08-stage-checklist.md`가 정본이다. 여기 적힌 수치는 작성 시점 읽기 확인값이므로 작업 시작 때 다시 확인한다.

## 1. 현재 버전 (읽기 확인)

| 항목 | 값 |
| --- | --- |
| main | `a2bd566` (#470 공개 주문 링크 안내) |
| Production | 같은 `a2bd566`, Vercel `dpl_3nL5jGg2pEB55bQsgEnVLVE81LRg` READY |
| main CI | build · stage-a-integration · lead-customer-continuity-pg17 통과 |
| 런타임 오류 | 최근 6시간 0건 |
| 대표 회사 | 제이에스리테일 `04ebb7bb-8da0-4723-8211-f2a947939344` |
| 대표 회사 DB | 상품 741 · 매장 계정 1 · 주문 링크 0 · 주문 0 · 배송 권역 1(송파구) · 권역 요일 규칙 1 |
| 단계 진행 | 구현 17/31(55%) · 운영 완료 0/6 |

## 2. 처음 한 번 준비 (로컬 Claude Code)

1. `gh repo clone a01055929144-web/maju-intelligence` → `cd maju-intelligence`
2. Node 24, `npm ci`
3. `vercel link`(팀 `team_MI9LCOMsqu2mjTlQghDmzY2D`, 프로젝트 `prj_IcltSvkqDzpywlaZYHUjwRBmfBvJ`) → `vercel env pull .env.local` (커밋 금지·출력 금지)
4. `gh auth login` (PR·CI 조회용)
5. Claude Code MCP 연결 권장: Supabase(운영 프로젝트 `fcmdvveqmcgtioelzqun`, **읽기 조회만**), Vercel(배포·로그), Notion(고객사 피드백). 브라우저 확인은 Playwright(합성 데이터) 우선, 운영 사이트는 읽기만.
6. 확인: `npx tsc --noEmit && npm run lint && npm test && npm run check:auth-boundaries`

## 3. 작업 규칙 요약 (자세한 건 CLAUDE.md 1절)

- `claude/<작업>` 브랜치 → PR → CI 전체 초록 → 병합. main 직접 커밋 금지.
- 운영 DB 쓰기·스키마 변경은 SQL 초안+down+PG17 → **대표 승인 문구** → 적용 → 읽기 검증.
- 새 기능은 기본 OFF + 회사 allowlist. 대표 회사 외 활성화·돈 관련 활성화는 대표 승인.
- Production 배포는 대표 지시가 있을 때만(횟수 제한 없음 — 11/11). 자동 배포는 꺼져 있다.
- 비밀값은 이름만 기록(`docs/work-orders/owner-change-later.md`), 값은 어디에도 쓰지 않는다.
- 금지: 단체 문자·카톡 매크로, 스크래핑(인스타 ID는 수동 붙여넣기만), 비밀번호 입력·대리 로그인, 개인정보 파일 커밋, hold 모듈 노출.
- PR 첫 줄: `Ponytail: 해당 없음(Claude Code) — 최소 변경·재사용 확인`(CLAUDE.md 8-2).

## 4. 열린 PR과 처리 방향

| PR | 내용 | 상태 | 이관 후 처리 |
| --- | --- | --- | --- |
| #471 | 매장 카카오 홈: 문서·주문·원가관리 한 화면 | Draft, CI 진행 중(코덱스 작업 중) | 코덱스 완료·CI 초록 후 병합 판단. 플래그 OFF 유지 |
| #450 | 본인 연결 해제·점주 매장 삭제 | Draft | #471 뒤 재정렬 |
| #410 | 주문 배송지 snapshot·완료 생산자 SQL | Draft, 운영 SQL 승인 대기 | D 단계 착수 때 승인 패킷 확인 |
| #384 | 주문→매출전표·원장 SQL | Draft | E 단계. D 계약 확정 전 보류 |
| #404 | 재고 재반영 차단 | Draft | E 단계와 함께 |
| #378 · #367 | 오늘 코스 후보 배송 가능 여부 게이트 | Draft | D 단계 |
| #368 | 열람 전용 링크 SQL 초안 | Draft | 필요성 재확인 후 정리 |
| #268 · #259 | 매장 공동 주문·원가 점검표 / 상품관리 행사·임박 진입점 | 열림(오래됨) | 최신 main 기준 재확인 → 닫거나 재작성 |
| #267 | 고객사 ERP 코드와 내부 P-코드 분리 설계 | Draft | P1 작업 때 사용 |
| #257 | 폐기된 매입가 등락 설계 | 병합 금지 | 닫기 |
| #198 · #195 · #197 · #177 · #320 · #419 | 예전 S-1/S-2·테스트·문서 초안 | Draft | 하나씩 유효성 확인 후 닫기 또는 갱신 |

## 5. 단계별 남은 일 (다음 작업 순서)

1. **C 첫 주문 (최우선)**
   - [ ] 고객사 **주문 확인 화면**(새 주문 목록 → 확인 처리). 지금 `/orders`는 404라 첫 주문을 받아도 처리할 곳이 없다. C 완료 조건에 넣는다.
   - [ ] 대표 회사 시험 매장 1곳: 카카오 가입 → 송파구 주소 저장 → 권역 안 주문 1건·권역 밖 차단 1건 → 주문 내역.
   - [ ] 03 거래처 연결 불일치 차단(#460) 과거 영향 건수 읽기 확인·SQL 승인.
2. **문서 정리** (대표 지시: #471 반영 후) — `claude/review-checklist-flow-2026-11-10.md`(Project) 지적 7가지 반영. 체크리스트 상단 요약, gates 머리말, 블루프린트 4절·흐름도(배송 권역·요일 → 링크), 매장 원가관리 우선순위.
3. **A 운영 완료**: 대표가 매입가 대표 파일 화면에서 적용일·4품목 제외·188 보류·553 선택 확인 후 저장.
4. **B 운영 완료**: 실제 전달 1회 → 연락 기록 1회 확인.
5. 그다음 D 배송(주문 ID→코스→기사 완료) → E ERP 선택 연결 → F 지표.

## 6. 대표 요청 중 확인이 필요한 것 (11/04~11/05, Claude 직접 작업분)

| 요청 | 확인된 상태 | 남은 것 |
| --- | --- | --- |
| 매입이력 수정·기간 검색·품목별 이력 | A 체크 "매입이력·정정" 완료 표시 | 실제 화면에서 기간 검색·품목 클릭 이력이 되는지 확인 |
| 견적·단가 규격 누락 | #251·#270 수정 | 대표 회사 문서에서 확인 |
| 주문 링크 판매가 등락 표시 | #263 회사 동의 기본 OFF | 켤지 대표 결정 |
| 매장 원가관리(엑셀 업로드) · 주문 링크 모놀리스 | #471 진행 중, SQL 초안 `20261105-store-cost-*`, `20261107-store-cost-batch-import` | 승인·적용 상태 확인 |
| 행사·임박을 상품관리로 · 템플릿 분리 | #259 열림(오래됨) | 재확인 |
| 상품 수정 창 분류 선택 · 업로드 직후 분류 추천 | 미확인 | 착수 전 코드 확인 |
| 고객사 피드백(Notion 2026-11-05 ERP) | 반영 기록 없음 | 페이지 읽고 항목별 상태 표 작성 |
| Claude 직접 작업 PR #223~#246의 Ponytail 개선 | `docs/qa/20261106-ponytail-category-pricing-review.md` 1건 | 범위 전체 끝났는지 확인 |

## 7. 기능 플래그 (이름만 · 값은 Vercel에서 확인)

- 대표 회사만 ON: 가격·문서(`FEATURE_PRICING_COMPANY_IDS`), 매입가 배치·날짜 v2, 개업 준비 가입, 기본주소 분리, 주문 주소 검증, 점주 주소 수정, 공개 점주 배송 연결(다음 배포부터).
- 기본 OFF: Stage D 주문 ID·완료(`FEATURE_STAGE_D_*`), 주문 배송 snapshot, 매장 회원 세션, 리드 문서 공유 전역, 매입 정정.
- 전체 목록·바꾸는 법: `docs/work-orders/owner-change-later.md`.

## 8. 작업 영역 소유 (Codex와 병행 시)

01 지도 · 02 배송 생산자 · 03 수락·전표·원장 · 04 업로드·상품·재고 · 05 전달 기록 · 06 지표 · 07 인증·회원·가입 주소 · 08 관리자 · 09 문서·주문·매장 UI. 공유 파일(`lib/store.ts`, 메뉴, 백엔드 계약, 중앙 체크리스트·승인표)은 컨트롤타워(이관 후 Claude Code)가 조정한다. Claude Code가 한 영역을 맡으면 그 영역의 Codex 작업방은 멈추거나 다른 영역으로 옮긴다.

## 9. Claude Code 첫 세션에 붙여 넣을 지시

```
CLAUDE.md, docs/handoff/2026-11-10-claude-code-migration.md, AGENTS.md,
docs/work-orders/2026-11-08-stage-checklist.md 를 읽어.
1) main·Production·열린 PR·대표 회사 DB 건수를 다시 읽기 확인해서 이 문서 1절과 다른 점만 보고해.
2) 5절 1번 "고객사 주문 확인 화면" 설계를 짧게 제안하고(기존 store_orders·공통 표 재사용, 플래그 OFF),
   내가 확인하면 claude/order-inbox 브랜치로 구현·테스트·PR까지 진행해.
운영 DB 쓰기·배포·플래그 변경은 내 승인 없이 하지 마. 한국어로, 끝에 진행률 표.
```
