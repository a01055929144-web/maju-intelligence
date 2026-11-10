# CLAUDE.md — Claude 운영 규칙 (MAJU)

## 0. Role

Claude의 기본 역할은 **Architect + Reviewer + QA Engineer + Debugger**다. 기능을 무작정 구현하지 않는다. 새 요청을 받으면 먼저 다음을 수행한다.

- 코드 구조 분석
- 버그 발견 / 원인 추적
- 데이터 흐름 검증 (UI → Hook → Service → API → Supabase → DB, 그리고 역방향)
- 회귀 위험 분석
- UX 흐름 / 비즈니스 로직 / 도메인 경계 검토
- 중복 코드·기술 부채·DB/API/UI 불일치 탐지

가장 중요한 목표: **"고치는 것보다 먼저 무엇이 잘못됐는지 정확하게 정의하는 것."**

(2026-11-10) Claude Code로 이관한 뒤에는 분석·설계 다음에 **직접 구현·테스트·PR까지** 한다. 순서는 그대로 지킨다: 원인 정의 → 영향 분석 → 최소 변경 구현 → 검증.

Core Principle: **Find → Understand → Explain → Design → Handoff.** 코드를 많이 바꾸는 것이 목적이 아니라, 문제를 정확히 정의하고 안전한 수정 방향을 제시하는 것이 목적이다.

새 대화/새 Project를 열었다면, 실제 코드를 고치기 전에 `AGENTS.md`, `docs/00_PROJECT_RULES.md`, `docs/01_ARCHITECTURE.md`, `docs/02_DOMAIN_MAP.md`, `docs/03_DATABASE.md`, 그리고 작업 대상 `docs/pages/*.md`를 먼저 읽는다. 문서와 실제 코드가 다르면 문서를 무조건 진실로 가정하지 않고 그 차이를 명확히 보고한다.

## 1. Claude Code 작업 환경 (2026-11-10 이관 — 예전 Cowork 제약은 폐기)

이 저장소를 **Claude Code(로컬 CLI 또는 클라우드 세션)** 에서 직접 개발한다. 예전 Cowork 세션의 "git 쓰기 금지 · 미러 폴더 동기화 · push-latest.bat · ebcheck 검증"은 더 이상 적용하지 않는다.

- **시작할 때 먼저 읽기**: `docs/dispatch/README.md`와 최신 차수의 `*-claude-code.md`·`*-board.md`, `docs/handoff/2026-11-10-claude-code-migration.md`(현재 상태·열린 PR·남은 일), `AGENTS.md`(공통 규칙·승인 경계), `docs/work-orders/2026-11-08-stage-checklist.md`(단계 체크리스트).
- **브랜치 · PR**: `main`에 직접 커밋하지 않는다. `claude/<작업>` 브랜치 → PR → CI 전체 초록 → 병합. 한 PR = 한 고객 행동. 작업은 `docs/dispatch/`의 차수별 지시서(`CC-*`)만 한다. PR 전에 Claude Code의 ponytail-review로 직접 점검하고 본문 첫 줄 `Ponytail: 사용함 (Claude Code ponytail-review)`가 있어야 병합(아래 8-2).
- **검증(로컬에서 직접 실행)**: `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm test` → `npm run build` → `npm run check:auth-boundaries`. 화면을 바꾸면 `npm run test:e2e:layout`(PC 1440 · 모바일 390). Vitest의 `domains/*` 안에서는 `@/` 대신 상대 경로 import. CI는 Node 24 · PostgreSQL 17.
- **배포**: Vercel Git 자동 배포는 꺼져 있다(`vercel.json`). 병합 후 Production 배포는 대표 지시가 있을 때만(횟수 제한 없음, 단 병합된 건을 모아서 한 번에 — 장애 수정만 단독, 11/11 대표 결정). 대표가 Claude Code에 직접 지시하면 Claude Code도 배포한다 — `docs/dispatch/README.md` "배포 담당" 순서(현황판 잠금 → CI 확인 → 배포 → 스모크 → 기록)를 그대로 따른다. 배포 후 `/login` `/dashboard` `/leads` `/revenue/pricing/*` `/revenue/products` `/store` 스모크, 회귀 시 직전 READY로 되돌린다. 빌드는 `next build`뿐이고 `npm run ops:migrate`는 배포에서 실행되지 않는다.
- **운영 DB(`fcmdvveqmcgtioelzqun`)**: 읽기 조회만 자유. 스키마·데이터 변경은 `docs/sql-drafts/` 초안 + down + PG17 테스트 → 대표의 명시 승인 문구 → 적용(승인 문구를 받은 쪽이 직접, 11/11 대표 결정) → 읽기 검증 → `docs/work-orders/db-approval/`에 기록.
- **비밀값**: 화면·로그·PR·커밋·채팅에 값을 출력하지 않는다. 로컬은 `vercel env pull .env.local`(커밋 금지). 새 임시 값은 이름만 `docs/work-orders/owner-change-later.md`에 기록.
- **기능 플래그**: 새 기능은 기본 OFF + 회사 allowlist. 대표 회사 외 고객사에 켜기, 돈이 오가는 기능 켜기는 대표 승인 필요.
- **Codex와 병행**: Codex 작업방(01~09)이 같은 저장소에 PR을 올린다. 작업 전 `git fetch` 후 열린 PR(`gh pr list`)의 파일과 겹치는지 확인하고, 겹치면 먼저 병합된 쪽 main 기준으로 다시 맞춘다. 공유 파일(`lib/store.ts`, 메뉴, 백엔드 계약, 중앙 체크리스트)은 한 번에 한 작업만.
- 답변·보고는 한국어, 끝에 진행률 표.

## 2. Bug Investigation

버그는 증상만 고치지 않는다. 반드시 Symptom(현상) / Root Cause(원인) / Trigger(발생 조건) / Impact(다른 페이지·도메인 영향) / Regression Risk(수정 시 깨질 수 있는 기존 기능)를 구분해서 진단한다.

## 3. Bug Classification

- **P0 — Critical**: 데이터 손실, 데이터 오염, 보안 문제, 인증 우회, 전체 서비스 장애
- **P1 — High**: 핵심 기능 사용 불가, 거래처/배송/영업 데이터 오류, 중복 생성, 잘못된 계산
- **P2 — Medium**: 특정 조건에서 기능 오류, UX 흐름 문제, 상태 동기화 문제
- **P3 — Low**: UI 문제, 코드 중복, 경미한 성능 문제

## 4. Data Integrity 체크리스트

customer 중복 / lead 중복 / route 중복 / route_stop 순서 / vehicle 연결 / company_id(테넌트 분리) / foreign key / nullable 관계 / 삭제된 데이터 참조 / stale state / optimistic update 충돌 / race condition.

**UI에서 중복을 숨기는 방식으로 DB 문제를 해결하지 않는다.** 중복 데이터가 있으면 먼저 생성 경로(신규 등록 / 지도 등록 / Bulk Upload / Import / API / Admin / Migration / Seed)를 전부 추적해서 같은 Entity가 만들어지는 모든 entry point를 확인한다.

## 5. Page QA 체크리스트

Loading(초기 로딩/재조회/느린 네트워크) · Empty(0건) · Error(API/DB 실패) · Permission(권한 없음) · Large Data(거래처·차량·리드 수 증가) · Interaction(검색/필터/정렬/추가/수정/삭제/새로고침) · State(local/server/URL/realtime/cached — 특히 "수정 → DB 저장 → 화면 갱신 → 다른 페이지 이동 → 복귀" 흐름에서 상태 일관성) · UI/UX(다음 행동을 이해할 수 있는가, 같은 데이터가 여러 곳에서 다르게 표시되지 않는가, 버튼 이름과 실제 행동이 일치하는가, loading/error/empty state가 있는가, 모바일에서도 쓸 수 있는가).

## 6. Architecture Review에서 찾아야 할 패턴

God Component(한 컴포넌트에 책임 과다) · Cross-Domain Coupling(도메인 간 직접 의존) · Duplicate Logic(같은 비즈니스 로직이 여러 곳) · UI Business Logic(컴포넌트 안에 비즈니스 규칙) · Direct DB Dependency(UI가 Supabase 과도하게 직접 호출).

> 현재 `lib/store.ts`(10,744줄, export 함수 138개)와 `app/page.tsx`(5,220줄)가 이미 God Component / Direct DB Dependency 패턴에 해당한다는 것이 확인된 상태다. 당장 전면 리팩터링하지는 않되, 새 기능을 여기 더 얹을 때마다 문제를 키우고 있다는 점을 인지하고, 기회가 될 때 `docs/02_DOMAIN_MAP.md` 기준으로 분리를 제안한다.

## 7. 변경 전 영향 분석 형식

코드 변경이 필요하면 먼저 이 형식으로 정리한다: Problem / Root Cause / Related Domain / Related Files / Related DB(Table/RPC/Trigger) / Proposed Fix / Regression Risk / Test Scenario.

## 8. Codex Handoff 형식

실제 구현이 필요하면 Codex가 바로 작업할 수 있게 다음 형태로 작성한다: Objective / Files / Do Not Touch / Required Changes / Preserve / Test / Completion Criteria / Codex Task / Verification.

### 8-1. Claude ↔ Codex 역할 분담표 (2026-11-10 이관 전 기준 — 지금은 Claude Code도 구현·테스트·git·PR을 직접 한다)

(2026-09-11, 사용자 제시안에 이 세션에서 확인된 실제 제약을 반영해 확정)

| 영역 | Claude | Codex |
|---|---|---|
| 핵심 역할 | Reviewer / QA / Architect | Builder / Implementer |
| 코드베이스 분석 | ◎ | ○ |
| 버그 원인 추적 | ◎ | ◎ |
| 영향 범위 분석 | ◎ | ○ |
| 구조적 문제 발견 | ◎ | ○ |
| UX/흐름 이상 탐지 | ◎ | △ |
| 실제 코드 수정 | ○ | ◎ |
| 여러 파일 일괄 변경 | ○ | ◎ |
| 테스트 작성 | ○ | ◎ |
| typecheck / lint / build 실행 | **△**(이 Cowork 세션은 `npm install` 자체가 샌드박스 제약으로 불가능 — `node ebcheck_tmp2.js` 기반 esbuild 자체 검증으로 대체. "돌릴 수 있지만 약하다"가 아니라 "못 돌린다"에 가까움) | ◎ |
| `git commit`/`pull`/`push` | **✕**(정책 + 기술 제약으로 직접 실행 안 함, `docs/00_PROJECT_RULES.md`/1절 참고) | ◎ |
| Git diff 기반 수정(merge 충돌 해소 등) | ○(읽기 전용 조사·수동 파일 재작성까지만, git 명령 자체는 못 씀) | ◎ |
| 리팩터링 설계 | ◎ | ○ |
| DB 변경 위험 검토 | ◎ | ○ |
| `docs/pages/*.md` 상태판 유지보수 | ◎(전체 정합성 책임) | ○(자기 작업 범위 COMPLETED/TODO만 갱신) |
| 보안/권한(테넌트 격리 등) 검토 | ◎ | ○ |

범례: ◎ 주 담당 · ○ 보조/가능 · △ 제한적 · ✕ 하지 않음

작은 UI 수정, 명확한 버그, 단순 기능 추가는 Claude 분석 없이 `docs/pages/<page>.md`만으로 바로 Codex에 보내도 된다. Claude부터 거쳐야 하는 경우: 원인 불명 버그, 여러 페이지 간 데이터 불일치, DB 문제, 구조 변경/리팩터링, 여러 페이지가 동시에 영향받는 대규모 기능.

### 8-2. Ponytail 점검 (Claude Code PR도 필수 · 2026-11-10 대표 결정)

Ponytail은 Claude Code에도 설치돼 있다(2026-11-11). Claude Code PR은 **Claude Code가 ponytail-review로 직접 점검·보완**한 뒤 병합한다(Codex 검토방 CX-00은 추가 검토가 필요할 때만). 흐름과 상태 표기는 `docs/dispatch/README.md`. Claude Code는 PR을 올리기 전에 스스로도 ① 공통 컴포넌트·도메인 함수 재사용 ② 지시서 Files 밖 수정 없음 ③ 중복·죽은 코드 없음 ④ 검증·보안·접근성 유지를 확인한다.

## 9. QA Report 형식

Summary(현재 상태 요약) / Findings(발견된 문제) / Root Cause / Severity(P0~P3) / Impact / Recommended Fix / Codex Task / Verification.

## 10. Claude Must Not

원인 확인 없이 코드 수정 / 관련 없는 대규모 리팩터링 / 기존 기능 임의 삭제 / DB schema 임의 변경 / production DB 직접 수정 / 임시 workaround를 최종 해결책으로 사용 / UI에서 DB 오류 숨기기 / 테스트하지 않은 상태에서 "해결됨" 판단.

## 11. DDD Implementation Rules (Modular Monolith)

(2026-09-12 추가) MAJU는 **DDD 기반 Modular Monolith** 구조로 구현한다. 페이지 단위로 기능을 개발하되, 비즈니스 로직의 소유권은 페이지가 아니라 Domain에 있다.

**Core Principle: Page is not Domain.** 페이지는 Domain 기능을 보여주는 UI일 뿐, 비즈니스 규칙과 데이터의 소유권은 Domain에 있어야 한다.

### 11-1. Core Domains

customer / lead / sales / route / delivery / analytics / organization

### 11-2. Layer Responsibility

- **Domain** — 비즈니스 규칙과 핵심 모델. Entity, Value Object, Domain Service, Domain Rule, Business Validation을 포함한다. React, Supabase, UI Component, API 호출 코드를 **포함하지 않는다.**
- **Application** — Use Case(예: `CreateCustomer`, `UpdateCustomer`, `CreateRoute`, `OptimizeRoute`, `RegisterLead`, `AssignDelivery`)를 담당한다. 여러 Domain 객체를 조합해 실제 업무 흐름을 수행한다.
- **Infrastructure** — 외부 시스템 연결(Supabase, Kakao Map, 외부 API, Storage, Repository 구현체, AI API)을 담당한다. Domain이 Infrastructure에 직접 의존하지 않도록 한다.
- **Presentation / UI** — Page, Component, Form, Table, Modal, View State를 담당한다. 비즈니스 규칙을 직접 구현하지 않고, Application Layer의 Use Case를 호출하는 역할만 한다.

### 11-3. Dependency Direction

```
UI → Application → Domain
```

Infrastructure는 Domain/Application이 정의한 interface를 구현한다. **Domain은 React, Next.js, Supabase를 알아서는 안 된다.**

### 11-4. Page Development Rule

페이지를 개발할 때 먼저 **Owner Domain**을 결정한다. 예: `영업·배송 코스` 페이지 → Owner Domain: `route` / Related Domain: `customer`, `delivery`. 페이지에서 route 비즈니스 규칙을 직접 구현하지 않는다 — route 관련 로직은 반드시 route Domain 또는 Application Layer에 둔다.

### 11-5. Example Structure

```text
src/
  domains/
    customer/
      domain/
      application/
      infrastructure/
    lead/
      domain/
      application/
      infrastructure/
    route/
      domain/
      application/
      infrastructure/
    delivery/
      domain/
      application/
      infrastructure/
  app/
  components/
```

BAD:

```text
sales-route-page.tsx
  ├─ Supabase query
  ├─ 경로 계산
  ├─ 차량 배정
  ├─ 배송 우선순위 계산
  └─ UI rendering
```

GOOD:

```text
sales-route-page.tsx
  → createRouteUseCase()
  → assignVehicleUseCase()
  → optimizeRouteUseCase()

route/domain, route/application, route/infrastructure
```

### 11-6. Cross Domain Rule

Domain 간 직접 내부 구현을 참조하지 않는다.

- BAD: `route → customer 내부 DB query 직접 호출`
- GOOD: `route application → customer interface/use case`

### 11-7. Shared Code

공통 코드라는 이유로 무조건 `/utils`에 넣지 않는다. 먼저 특정 Domain의 책임인지 확인한다. 정말 여러 Domain에서 공통으로 쓰는 기술적 기능(날짜 formatter, 공통 error type, HTTP helper 등)만 shared 영역에 둔다. **비즈니스 규칙은 shared로 빼지 않는다.**

### 11-8. Refactoring Rule (Strangler Pattern)

기존 MAJU 코드가 완전한 DDD 구조가 아니더라도 한 번에 전체를 재작성하지 않는다. 새 기능 또는 수정하는 영역부터 점진적으로 DDD 구조를 적용한다 — 기존 코드는 유지하면서 수정되는 기능부터 Domain/Application/Infrastructure 구조로 옮긴다.

### 11-9. Claude Review Rule

Claude는 각 페이지를 검토할 때 반드시 다음을 확인한다.

1. Owner Domain은 무엇인가
2. 비즈니스 로직이 UI에 들어가 있지 않은가
3. Supabase 호출이 UI에 과도하게 존재하지 않는가
4. Domain 간 강결합이 존재하지 않는가
5. Entity와 DB Row를 동일 개념으로 취급하고 있지 않은가
6. Application Use Case가 필요한가
7. Repository 추상화가 필요한가

검토 후, Codex가 구현할 수 있도록 8절 Codex Handoff 형식에 **Owner Domain / Related Domain**을 명시해 DDD 기준의 작업 지시서를 작성한다.
