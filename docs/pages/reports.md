# Reports (AI 리포트)

## Status
운영 중. 카드 시스템 통일, 액션 카드 중복 정리, 회사 리포트 권한 게이트 적용 완료.

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
ACTIVE (카드 시스템/액션 카드 정리 완료, 후속 항목은 TODO 참고)

## LAST VERIFIED
2026-09-19 — 권한 게이트와 ESLint 설정을 포함해 typecheck/lint/build/test PASS.

## BUILD
PASS (`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test -- --run`)

## COMPLETED

- [x] 2026-10-07 핵심 결론과 낮은 점수 기반 우선 액션을 첫 화면에 유지하면서 KPI·건강도·진단 카드의 높이와 여백을 압축했다. 인쇄/PDF에서는 작업 버튼과 접이식 제어를 숨기고 주요 블록의 페이지 분할을 방지했다.

- [x] 2026-09-30 인쇄·PDF 저장, 링크 복사, 공유 성공·취소·실패 피드백과 모바일 터치 영역을 개선했다.

- [x] 2026-09-29 실제 운영 데이터 기반 리포트임을 표시하고, AI 실행 제안은 담당자 검토가 필요한 참고 제안임을 명시했다.
- [x] `ReportBasisPanel`의 raw `maju-section-card` div를 shadcn `Card` 컴포넌트로 교체 — 이 페이지 안에서 카드 컨테이너가 `Card`/`maju-section-card` 두 갈래로 섞여 있던 것을 `Card` 하나로 통일(내부 그리드/버튼/라벨 유틸리티 클래스는 그대로 유지, 시각적 변화 없음).
- [x] "다음 액션" 성격 카드 3개(우선 실행 액션 / 점수 기반 실행 보드 / 리포트 후 바로 실행할 작업) 중 "리포트 후 바로 실행할 작업" 카드를 제거 — 이 카드의 링크 3개(거래처 원장 정리, 방문·배송 코스 계산, 데이터 업데이트)가 "점수 기반 실행 보드"가 이미 제공하는 4개 링크(CRM관리/배송효율/신규영업/영업력, 점수 기반 우선순위 포함)의 완전한 부분집합이라 실질적 정보 손실 없이 제거함. 남은 두 카드는 서로 다른 축(점수 기반 우선순위 vs. 오늘/이번주/이번달 시간 기준 체크리스트)이라 유지.
- [x] `/reports/[id]` 회사 전체 리포트를 `view_company_operations` 권한 또는 플랫폼 관리자에게만 노출
- [x] ESLint flat config 추가 및 비대화형 lint 실행 가능

## TODO
- [ ] `app/page.tsx`도 이 파일과 동일하게 shadcn Card와 raw `maju-section-card`를 함께 쓰고 있음(전체 저장소에서 두 패턴을 한 파일 안에 같이 쓰는 곳은 이 파일과 `app/page.tsx` 단 둘뿐이었음, 나머지 23개/13개 파일은 각자 한 쪽만 사용해 실제로는 섞여 있지 않았음). 다만 `app/page.tsx`는 5,220줄 God Component로 이미 별도 리팩토링 위험이 기록돼 있어(`docs/01_ARCHITECTURE.md`), 이번 작업 범위에서 제외하고 별도 Codex Handoff로 다룰 것을 권장.

## KNOWN ISSUES
_(비어있음 — 위 두 건 해결됨)_
