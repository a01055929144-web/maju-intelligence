# Customers Summary (전체현황)

## Status
운영 중. 2026-09-08에 페이지 제목과 첫 카드 제목이 둘 다 "전체 현황"으로 중복되던 문제 수정("거래처 기준 현황"으로 변경).

## Goal
회사 전체의 거래처 현황(KPI 요약)을 한눈에 보여준다.

## Owner Domain
analytics

## Related Domains
customer

## Allowed Files
- `app/crm/summary/page.tsx`
- `components/churn-risk-alert.tsx` (customers.md와 공유)

## Data Flow

| Source | Used For |
|---|---|
| `normalized_customers` | 거래처 수/현황 집계 |
| `health_score_snapshots` | 이탈위험 요약 |

## Do Not Touch
- `lib/store.ts`의 lead/sales 전용 섹션

## Preserve
- 카드 제목과 실제 표시 내용 일치(과거 중복 제목 버그 재발 금지)

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
- [x] 중복 제목("전체 현황" 페이지 제목 vs 첫 카드 제목) 수정

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
