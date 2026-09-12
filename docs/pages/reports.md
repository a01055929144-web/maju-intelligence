# Reports (AI 리포트)

## Status
운영 중. 카드 시스템 통일 및 액션 카드 중복 정리 완료(2026-09-12).

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
2026-09-12 — `npx tsc --noEmit` PASS, `npm run build` PASS(신선한 클론 환경, node_modules 새로 설치해 검증). `npm run lint`은 이 저장소에 ESLint 설정 파일이 아직 없어 최초 1회 대화형 설정이 필요해 이 세션에서는 실행하지 못함(기존 KNOWN ISSUE #10 "CI가 lint 스템 없음"과 동일 원인 — 이번 변경이 새로 만든 문제 아님).

## BUILD
PASS (tsc, build 확인. lint는 설정 파일 부재로 미실행 — 아래 참고)

## COMPLETED
- [x] `ReportBasisPanel`의 raw `maju-section-card` div를 shadcn `Card` 컴포넌트로 교체 — 이 페이지 안에서 카드 컨테이너가 `Card`/`maju-section-card` 두 갈래로 섞여 있던 것을 `Card` 하나로 통일(내부 그리드/버튼/라벨 유틸리티 클래스는 그대로 유지, 시각적 변화 없음).
- [x] "다음 액션" 성격 카드 3개(우선 실행 액션 / 점수 기반 실행 보드 / 리포트 후 바로 실행할 작업) 중 "리포트 후 바로 실행할 작업" 카드를 제거 — 이 카드의 링크 3개(거래처 원장 정리, 방문·배송 코스 계산, 데이터 업데이트)가 "점수 기반 실행 보드"가 이미 제공하는 4개 링크(CRM관리/배송효율/신규영업/영업력, 점수 기반 우선순위 포함)의 완전한 부분집합이라 실질적 정보 손실 없이 제거함. 남은 두 카드는 서로 다른 축(점수 기반 우선순위 vs. 오늘/이번주/이번달 시간 기준 체크리스트)이라 유지.

## TODO
- [ ] (낮은 우선순위) 이 저장소에 ESLint 설정 파일(`eslint.config.*` 또는 `.eslintrc.*`)이 없어 `next lint`가 비대화형으로 실행 안 됨 — CI에도 lint 스템이 없다는 기존 KNOWN ISSUE #10과 동일 원인. 별도 작업으로 설정 파일 추가 검토.
- [ ] `app/page.tsx`도 이 파일과 동일하게 shadcn Card와 raw `maju-section-card`를 함께 쓰고 있음(전체 저장소에서 두 패턴을 한 파일 안에 같이 쓰는 곳은 이 파일과 `app/page.tsx` 단 둘뿐이었음, 나머지 23개/13개 파일은 각자 한 쪽만 사용해 실제로는 섞여 있지 않았음). 다만 `app/page.tsx`는 5,220줄 God Component로 이미 별도 리팩토링 위험이 기록돼 있어(`docs/01_ARCHITECTURE.md`), 이번 작업 범위에서 제외하고 별도 Codex Handoff로 다룰 것을 권장.

## KNOWN ISSUES
_(비어있음 — 위 두 건 해결됨)_
