# Customers (거래처 관리 / 원장)

## Status
운영 중. 2026-09-08에 카드 구조 버그(원장/기록 카드가 목록 카드 안에 중첩되던 문제) 수정 완료.

## Goal
거래처 목록을 검색·필터링하고, 선택한 거래처의 원장(거래 이력)과 기록(방문/메모)을 확인·편집한다.

## Owner Domain
customer

## Related Domains
route, delivery (담당자/차량 배정 표시)

## Allowed Files
- `app/crm/timeline/page.tsx`
- `components/customer-workspace-tabs.tsx`
- `components/customer-attachment-upload-panel.tsx`
- `components/churn-risk-alert.tsx`
- `components/loading-position-gallery.tsx`
- `components/sales-transaction-matcher.tsx`, `components/sales-transaction-table.tsx`
- `app/api/customers/**`, `app/api/customer-attachments/**`, `app/api/customer-operations/**`

## Data Flow

| Source | Used For |
|---|---|
| `normalized_customers` | 거래처 기본정보 |
| `customer_notes` | 메모/방문 히스토리 |
| `customer_attachments` | 사업자등록증/신분증/적재위치/배송완료 사진 |
| `sales_transactions` | 매출/거래 이력 |
| business status 필드 | 사업자 상태(휴폐업 등) |

## UX Rules
- 상세 정보 카드가 서로 겹치거나 잘리지 않도록 auto-fit 레이아웃을 우선한다.
- 중요한 액션(메모 저장, 첨부 업로드)은 상단 고정 또는 상세 패널 내 명확한 버튼으로 둔다.
- 설명 문구는 줄이고 상태값·누락값을 먼저 보여준다.

## Do Not Touch
- `lib/store.ts`의 lead 전용 섹션
- `auth/**`, `billing/**`

## Preserve
- 거래처 목록 / 원장 / 기록 3개 카드가 형제 섹션으로 독립(과거 중첩 버그 재발 금지 — `#customer-ledger-list`, `#customer-ledger-detail`, `#customer-ledger-history` 세 앵커가 실제로도 같은 depth여야 함)
- 담당자명/배송차량은 자유 텍스트가 아니라 등록된 데이터 기준 드롭다운
- 연락처 하이픈 포맷 표시

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 세 카드 구조가 DOM상 진짜 형제인지 재확인(중첩 회귀 방지)

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 카드 구조 버그 수정(목록 카드가 원장/기록 카드를 950줄 넘게 감싸던 문제)
- [x] 안내 문구를 실제 레이아웃(세로 스택)에 맞게 수정
- [x] 담당자명/배송차량 등록 데이터 기준 드롭다운 전환
- [x] 연락처 하이픈 포맷 표시
- [x] 거래처 상세 배송권역 지정 기능 제거(불필요 판단)
- [x] 매출 거래 매칭(`sales-transaction-matcher`) 연동

## TODO
- [ ] 거래처-리드 교차 중복 병합 로직 추가(같은 매장이 거래처와 리드에 동시 존재하는 케이스, `docs/pages/leads.md`와 공동 작업 필요)
- [ ] 거래처 0건 표시 버그 수정(Claude 원인 분석 완료, 2026-09-11 — 아래 KNOWN ISSUES 참고. Codex 구현 대기)

## KNOWN ISSUES
- **거래처 0건 표시 버그 — 원인 확정(2026-09-11, Claude 분석)**: 실제 companyId 불일치로 0건이 조회되는 것이 아니라, `app/crm/timeline/page.tsx`의 `/api/customers` 호출부(약 235~263행)가 "API 실패"와 "진짜 0건"을 구분하지 않고 둘 다 동일하게 `customers=[]`로 접어버리는 것이 원인. 실패 경로 3가지를 확인함: (1) admin 프리뷰 모드는 세션 쿠키 없이 URL의 `?companyId=` 쿼리 하나로만 테넌트를 구분하는데(`lib/auth.ts` `getRequestAuthScope` admin 분기), 이 파라미터가 없으면 API가 401을 반환 (2) `app/api/customers/route.ts` GET에 try/catch가 없어서 `lib/store.ts`의 `getCustomerMaster`가 컬럼 누락이 아닌 다른 이유(네트워크 순단, Supabase 일시 오류 등)로 던지는 예외가 그대로 500으로 노출 (3) `fetchWithTimeout`의 12초 타임아웃 초과. 세 경우 모두 프런트에서 `response.ok`만 보고 `payload=null` → `customers=[]`로 귀결되어 실제 데이터가 있는 회사도 화면엔 "거래처 원장 비어 있음/미연결"과 동일하게 0건으로 보인다. "간헐적으로 보고됨"이라는 기존 증상과도 부합(고정 링크 문제가 아니라 네트워크/일시 오류 타이밍에 좌우). 상세 분석은 qa-report-customers-zero-count.md 참고, Codex Task도 그 안에 동일하게 정리되어 있음.
