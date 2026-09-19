# Customer Data History (등록 이력 조회)

## Status
운영 중.

## Goal
거래처 데이터가 언제·어떻게(수동/엑셀/API 등) 등록·수정됐는지 이력을 조회한다.

## Owner Domain
customer

## Related Domains
없음

## Allowed Files
- `app/customers/data/page.tsx`
- `components/pipeline-candidates-table.tsx` (표 정렬 유틸 공유)
- `lib/use-table-sort.ts`, `components/sortable-th.tsx`

## Do Not Touch
- `lib/store.ts`의 lead/sales/delivery 전용 섹션

## Preserve
- 정렬 가능한 헤더
- 페이지네이션(대량 데이터 시)

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-19 — 전체 typecheck/lint/build/test 검증 완료.

## BUILD
PASS (`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test -- --run`)

## COMPLETED
- [x] 등록 이력 표 정렬
- [x] 레이아웃 점검 완료(구조적 문제 없음)

## TODO
- [ ] 페이지네이션 보강 여부 재검토(대량 데이터 케이스)

## KNOWN ISSUES
없음.
