# Revenue Pipeline (기회 관리)

## Status
운영 중. 2026-09-08에 헤더 없이 떠 있던 액션 카드 묶음에 카드 헤더 추가.

## Goal
견적/관심/재관리 단계별 매출 파이프라인 후보를 관리한다.

## Owner Domain
sales

## Related Domains
customer

## Allowed Files
- `app/revenue/pipeline/page.tsx`
- `components/pipeline-candidates-table.tsx`
- `app/api/revenue/pipeline/route.ts`

## Do Not Touch
- `lib/store.ts`의 lead/delivery 전용 섹션

## Preserve
- 다음 액션 요약 카드(견적/관심/재관리)의 헤더-본문 일치
- 파이프라인 후보 표 정렬(서버→클라 컴포넌트 분리 구조 유지)

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
- [x] 매출 파이프라인 후보 표 정렬(서버→클라 컴포넌트 분리)
- [x] 헤더 없던 액션 카드 묶음에 maju-card-header 추가

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
