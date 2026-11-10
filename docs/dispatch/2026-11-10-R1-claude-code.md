# R1 작업지시 — Claude Code (2026-11-10)

운영 방식: [README](README.md). 진행 상황은 [R1 현황판](2026-11-10-R1-board.md)에 PR 번호와 함께 한 줄씩 적는다.
순서대로 진행한다. 각 작업은 **Draft PR + `Ponytail: 검토 요청`** 으로 올리고, Codex Ponytail 검토방 점검이 끝나면 CI 초록 확인 후 병합한다. 운영 배포·DB 쓰기·플래그 변경은 하지 않는다.

공통 시작: `git fetch && git switch -c claude/<ID>-<요약> origin/main` → 작업 → `npx tsc --noEmit && npm run lint && npm test && npm run build && npm run check:auth-boundaries` (화면 변경 시 `npm run test:e2e:layout`).

---

## CC-01 가끔 실패하는 매장 주소 테스트 고치기 (P1 · 30분)

- **Objective**: `tests/store-address-management.test.ts`의 위조 검사가 서명 마지막 글자가 원래 `x`면 위조가 되지 않아 약 1/64 확률로 실패한다(11/10 CI에서 실제 발생).
- **Files**: `tests/store-address-management.test.ts`만.
- **Required**: 마지막 글자를 "원래와 다른 글자"로 바꾸도록 수정(예: `x`면 `y`). 테스트 의도(위조 거부)는 그대로.
- **Test/Done**: 해당 파일 50회 반복 실행 전부 통과(`npx vitest run tests/store-address-management.test.ts --repeat 50` 또는 반복 스크립트), 전체 CI 초록.

## CC-02 고객사 주문함 — 새 주문 확인 처리 (P0 · C 단계 완료 조건)

- **Objective**: 매장 주문이 들어와도 고객사가 볼 곳이 없다(`/orders` 404, 회사용 주문 조회 API 없음). 고객사 대표·관리자·영업이 **새 주문을 보고 "확인"으로 처리**할 수 있게 한다. 첫 주문 운영 완료의 필수 조건.
- **Owner Domain**: order(09 소유 영역이나 이번 작업은 Claude Code에 배정 — 09는 `/store` 매장 화면(#471)만 맡는다). Related: customer, pricing.
- **DB 사실(읽기 확인)**: `store_orders.status` ∈ `submitted · received · in_delivery · delivered · cancelled`. 매장은 `submitted`이고 `revision`이 맞을 때만 주문을 고칠 수 있다(`place_store_order`의 `p_expected_revision`). 회사용 상태 변경 RPC는 없다.
- **Files (새로 만듦)**: `app/orders/page.tsx`(또는 기존 라우트 규칙에 맞는 위치), `app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`, `domains/order/inbox.ts`(상태 전이 규칙·순수 함수), `lib/order/inbox-repository.ts`, `components/order-inbox.tsx`, 테스트. **공유 파일 허용(이 작업만)**: `lib/customer-navigation.ts`에 주문 그룹 "주문함" 1줄 추가.
- **Do Not Touch**: `/store`·`components/storefront-*`·`app/api/storefront/*`(09·#471), 주문 생성 RPC, 가격 계산.
- **Required**
  1. 목록: 회사 범위(`company_id`는 서버 세션에서만), 상태 탭(새 주문=submitted / 확인=received / 배송중 / 완료 / 취소), 기간·매장명 검색, 공통 표(WO-01). 열: 접수시각·매장·배송일(미정 표시)·품목 수·합계(공급가/세액)·상태.
  2. 상세: 주문 줄 스냅샷(품목·규격·단위·수량·단가·과세), 요청 메모, 주문자 구성원, 배송지 스냅샷이 있으면 표시.
  3. "확인" 처리: `submitted → received`만 허용. 조건부 갱신(`id`·`company_id`·`status=submitted`·`revision=기대값`)으로 1행만 바뀌어야 성공, 0행이면 409 "매장이 방금 주문을 고쳤습니다. 새로고침해 주세요". 성공 시 `revision+1`(매장의 이전 revision 수정 차단). **REST 조건부 PATCH로 원자성이 확보되지 않으면 멈추고 SQL 초안(`docs/sql-drafts/` + down + PG17)으로 RPC를 제안**한다(운영 적용은 대표 승인).
  4. 권한: owner·manager·sales만 조회, 확인 처리는 owner·manager. 관리자 미리보기는 읽기만.
  5. 플래그: `ORDER_INBOX_ENABLED` + `FEATURE_ORDER_INBOX_COMPANY_IDS`, 기본 OFF(꺼지면 페이지·API 404). 이름만 `owner-change-later.md`에 추가.
  6. 빈 상태("아직 주문이 없습니다 — 링크 관리에서 주문 링크를 보내 보세요"), 오류·권한 안내.
- **Preserve**: 매장 주문·수정·내역 동작, 원가·마진·공급처 비노출.
- **Test**: 상태 전이 단위 테스트, API 권한·회사 격리·409 경쟁 테스트, PC/390 e2e(목록→상세→확인). 
- **Done**: 위 테스트·CI 초록, Ponytail 점검 완료, 현황판 기록. 대표 회사 ON은 별도 승인.

## CC-03 고객 계정에서 견적서·단가표 목록이 안 보이는 문제 (P0 · 노션 11/05 높음 1)

- **Objective**: 고객사(제이에스리테일) 대표 PC 계정에서 기존 견적서·단가표가 목록에 안 보였다(관리자 미리보기에서는 보임). 원인부터 정의한다.
- **Owner Domain**: pricing(문서). Related: organization(권한).
- **Files**: `components/pricing-documents-workspace.tsx`, `components/pricing-document-sheets.tsx`, `app/api/pricing-documents/route.ts`, `domains/pricing/access.ts`, 관련 테스트. **Do Not Touch**: 문서 편집기·미리보기 인쇄(CX-05), DB 함수.
- **Required**: ① 재현 조건 정리(역할 owner/manager/sales, 작성자 본인/타인, 보관·게시 상태, 회사 ID 해석) ② 원인 기록(Symptom/Root Cause/Trigger/Impact) ③ 최소 수정 ④ 역할별 목록 회귀 테스트.
- **Done**: 역할별로 같은 회사 문서가 보이는 테스트 통과. DB 함수 변경이 필요하면 SQL 초안까지만.

## CC-04 상품 수정 창에 분류 선택 칸 (P1)

- **Objective**: 상품관리에는 분류 표시·"분류 추천 미리보기"(Codex 구현)가 있지만 **상품 수정 창(`Editor`)에는 분류 칸이 없다.** 한 상품의 분류를 바로 고칠 수 있게 한다. 매입가 업로드 완료 안내("분류 추천 N개는 상품관리에서 확인")는 문장만 있으니 상품관리의 미분류 보기로 바로 가는 링크로 바꾼다.
- **Owner Domain**: catalog. Related: pricing(분류별 마진).
- **Files**: `components/product-catalog-admin.tsx`의 `Editor` 부분, `components/purchase-cost-workspace.tsx`의 완료 안내 줄(678행 부근)만, 필요 시 `lib/product-catalog-admin.ts` 저장 입력에 `category`(이미 `cleanCategory` 사용 중이면 재사용).
- **Do Not Touch**: 분류 추천 미리보기·일괄 저장(`update-categories`), 매입 저장 로직(CX-04), 가격 계산.
- **Required**: 분류 선택(대›중›소 경로 목록 + "MAJU 추천" 버튼 + 직접 입력), 저장 시 `cleanCategory`로 정규화. 업로드 안내 링크는 상품관리 미분류 필터로 이동.
- **Done**: 저장·재조회 테스트, PC/390 수정 창 확인, CI 초록.

## CC-05 회사 정보 · 사업자등록번호 칸 모양 맞추기 (P2 · 30분) — 대표 11/10 22:25

- **Objective**: 설정 › 회사 정보 › 기본 탭에서 사업자등록번호만 입력칸이 아닌 글자로 보여 다른 칸과 모양이 다르다(운영 화면 확인). 다른 칸과 같은 입력칸 모양으로, 수정 권한이 없으면 같은 모양의 읽기 전용(회색) + "대표만 수정할 수 있습니다".
- **Files**: `components/company-profile-form.tsx`(사업자등록번호 부분만). main 코드에는 입력칸이 이미 있을 수 있으니 운영 화면과 main을 먼저 대조하고 차이를 PR에 적는다.
- **Done**: PC/390 캡처, CI 초록.

## CC-06 견적서·단가표 편집 화면 상단 정리 + 공개 링크 흐름 단순화 (P0) — 대표 11/10 22:25

- **Objective**: ① 편집 화면 맨 아래에 있는 "버전 미리보기 · 공개 링크·QR"을 **상단 버튼 줄로** 올린다(이미 상단에 `공개 링크·QR` 버튼이 있으면 하단 중복 제거). ② 스크롤하면 고정된 상단 줄이 페이지 제목·다른 줄과 **겹친다** → 고정 영역 하나만 남기고 z-index·top·배경을 정리. ③ 공개 링크·QR 패널(`pricing-document-order-qr.tsx`)이 버튼 8개를 세로로 늘어놔 공간을 많이 차지하고 순서를 알기 어렵다 → **3단계 카드**로: [1 링크 만들기] → [2 QR·링크 받기: 복사 · QR PNG · 문서에 QR 넣기/빼기] → [관리: 회수 · 기존 거래처 전용 QR(접기)]. 한 줄 설명은 단계마다 1줄.
- **Files**: `components/pricing-documents-workspace.tsx`(상단 버튼 줄·하단 블록), `components/pricing-document-order-qr.tsx`(배치·문구만, API·토큰 로직 변경 금지).
- **Do Not Touch**: 미리보기·인쇄 렌더러(CX-05), 링크 발급 API·SQL, 문서 목록 권한(CC-03 — 같은 파일이면 CC-03을 먼저 병합하고 그 위에서 작업).
- **Done**: PC/390에서 스크롤 내려도 겹침 없음, 링크 만들기→복사→QR 저장이 한 화면에서 위→아래 순서로 보임, 기존 e2e(공개 링크 발급) 통과, CI 초록.

---

R1에서 Claude Code는 **CC-01 → CC-02 → CC-03 → CC-06 → CC-05 → CC-04** 순서(11/10 22:25 갱신). CC-02가 SQL 승인 대기에 걸리면 CC-03을 먼저 진행하고 현황판에 "막힘"으로 적는다.
