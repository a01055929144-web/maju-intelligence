# Reports (AI 리포트)

## Status
운영 중이나 개선 여지 있음(레이아웃 점검 시 발견, 아직 미착수).

## Goal
AI가 생성한 분석 리포트를 조회한다.

## Owner Domain
analytics

## Related Domains
sales

## Allowed Files
- `app/reports/[id]/page.tsx`
- `app/api/report/route.ts`
- `lib/analysis.ts`
- `components/data-registration-report.tsx`

## Data Flow

| Source | Used For |
|---|---|
| `ai_reports` | 저장된 리포트 |
| `normalized_customers` / `business_permit_leads` / `sales_transactions` | 리포트 생성 시 분석 대상 |

## Do Not Touch
- `lib/store.ts`의 customer/lead/delivery 전용 섹션

## Preserve
- 기존 리포트 렌더링

## Task
_(비어있음 — 아래 KNOWN ISSUES를 다음 작업으로 잡을 수 있음)_

## Completion
- TypeScript / lint / build PASS

---

## STATUS
ACTIVE (개선 여지 있음)

## LAST VERIFIED
2026-09-08 (레이아웃 점검만 수행, 코드 수정은 안 함)

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 레이아웃 점검(shadcn Card와 raw maju-section-card 두 카드 시스템 혼재 발견)

## TODO
- [ ] shadcn Card / maju-section-card 카드 시스템 통일 검토
- [ ] "다음 액션" 성격 카드 3개 중복 정리 검토

## KNOWN ISSUES
- 카드 디자인 시스템이 두 가지(shadcn Card, maju-section-card)로 혼재. 명백한 버그는 아니고 스타일 일관성 문제라 사용자 확인 후 진행 권장 상태로 보류됨.
