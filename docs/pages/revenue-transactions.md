# Revenue Transactions (거래내역)

## Status
운영 중. 2026-09-08에 헤더 없이 떠 있던 액션 카드 묶음에 카드 헤더 추가.

## Goal
매출 거래 원장을 조회하고, 업로드된 거래 내역을 거래처와 매칭한다.

## Owner Domain
sales

## Related Domains
customer

## Allowed Files
- `app/revenue/transactions/page.tsx`
- `components/sales-transaction-table.tsx`, `components/sales-transaction-matcher.tsx`
- `app/api/revenue/transactions/**`

## Data Flow

| Source | Used For |
|---|---|
| `sales_transactions` | 매출 원장 |
| `normalized_customers` | 거래-거래처 매칭 |

## Do Not Touch
- `lib/store.ts`의 lead/delivery 전용 섹션

## Preserve
- 매출 원장 테이블 정렬
- 거래-거래처 매칭 로직

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 매출 원장 테이블 정렬
- [x] 헤더 없던 액션 카드 묶음("다음 액션 요약")에 maju-card-header 추가

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
