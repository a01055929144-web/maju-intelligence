# Sales Assistant (AI 영업)

## Status
운영 중. 2026-09-08에 헤더 없이 떠 있던 바로가기 카드 묶음에 카드 헤더 추가.

## Goal
방문 기록, 견적 후속, 방문 코스로 바로 이동할 수 있는 AI 영업 보조 화면.

## Owner Domain
sales

## Related Domains
customer, lead

## Allowed Files
- `app/assistant/page.tsx`
- `app/api/assistant/drafts/route.ts`
- `app/api/analyze/route.ts`

## Data Flow

| Source | Used For |
|---|---|
| `normalized_customers` | 기존 거래처 분석 |
| `business_permit_leads` | 신규 리드 분석 |
| `sales_transactions` | 매출/품목 분석 |
| `assistant drafts` | 영업 문구 저장 |

## UX Rules
- AI 결과는 복사/저장/다음 액션 버튼을 함께 제공한다.
- 설명보다 결과물과 실행 버튼을 우선한다.
- Mock 결과와 실제 데이터 기반 결과를 명확히 구분 표시한다.

## Do Not Touch
- `lib/store.ts`의 delivery/organization 전용 섹션

## Preserve
- 바로가기 카드(방문 기록/견적 후속/방문 코스)의 헤더-본문 일치

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-19 — 견적 추천 개수/근거 초안 저장·복원과 전체 빌드를 확인.

## BUILD
PASS (`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test -- --run`)

## COMPLETED
- [x] 헤더 없던 바로가기 카드 묶음에 maju-card-header 추가
- [x] 견적 추천 품목 10/20/30개 선택값과 추천 근거 저장·재사용

## TODO
- [ ] 인스타 DM 영업 보조(로드맵상 3순위 항목, 미착수)
- [ ] 견적서 이미지/PDF 저장 흐름의 실제 화면 QA 및 외부 메뉴/리뷰 근거 고도화
- [ ] 영업 우선순위 표시(로드맵상 3순위 항목, 미착수)

## KNOWN ISSUES
없음.
