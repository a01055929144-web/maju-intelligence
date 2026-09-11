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

Core Principle: **Find → Understand → Explain → Design → Handoff.** 코드를 많이 바꾸는 것이 목적이 아니라, 문제를 정확히 정의하고 안전한 수정 방향을 제시하는 것이 목적이다.

새 대화/새 Project를 열었다면, 실제 코드를 고치기 전에 `AGENTS.md`, `docs/00_PROJECT_RULES.md`, `docs/01_ARCHITECTURE.md`, `docs/02_DOMAIN_MAP.md`, `docs/03_DATABASE.md`, 그리고 작업 대상 `docs/pages/*.md`를 먼저 읽는다. 문서와 실제 코드가 다르면 문서를 무조건 진실로 가정하지 않고 그 차이를 명확히 보고한다.

## 1. 이 세션(Cowork)만의 환경 제약 — 반드시 숙지

- **저장소 위치**: `C:\maju-deploy`(메인, GitHub origin과 동기화되는 배포 저장소)와 `C:\Users\dyoun\OneDrive\문서\New project\maju-intelligence`(보조 미러). **모든 코드 변경은 두 폴더 모두에 동일하게 적용하고, `diff -w`로 완전히 동일한지 확인한다.** (docs/ 파일도 동일하게 미러링한다.)
- **git 쓰기 명령을 직접 실행하지 않는다.** `git commit` / `git pull` / `git merge` / `git push` / `git stash`는 절대 실행하지 않는다. 이유는 정책(사용자가 직접 통제)이면서 동시에 기술적 제약이기도 하다 — 이 세션의 Linux 샌드박스에 마운트된 `C:\maju-deploy`는 파일 unlink/rename을 지원하지 않아서, `git stash`/`git commit` 등 내부적으로 lock 파일을 생성·삭제하는 작업이 `.git/index.lock`을 지운 채로 남기고 실패한다. 허용되는 것은 읽기 전용 명령(`git status`, `git log`, `git diff`, `git show`, `git fetch`)과, 파일 내용을 직접 덮어쓰는 것(`Edit`/`Write` 도구, 또는 `git show ref:path > path`처럼 open+truncate+write만 쓰는 셸 리다이렉트)뿐이다.
- **실제 git 커밋/푸시는 사용자가 `push-latest.bat`을 직접 실행해서 수행한다.** 새로 만들거나 수정한 파일은 반드시 `push-latest.bat`의 `git add` 목록에 있는지 확인하고, 없으면 추가한다. 커밋 메시지는 `commit-message.txt`(UTF-8, git 추적 대상 아님, `git commit -F`로 읽힘)에 이번 작업 설명을 이어붙인다.
- **`npm install`이 이 샌드박스에서 실패한다**(같은 unlink/rename 제약, `ENOTEMPTY` 에러). 따라서 `npx tsc --noEmit` / `npm run lint` / `npm run build`를 Claude가 직접 돌릴 수 없다. 대신 `node ebcheck_tmp2.js <file>`(esbuild 기반 문법 + JSX 태그 중첩 검증)과, 수정 전후 중괄호/괄호 개수를 `git show HEAD:<file>`과 비교하는 밸런스 체크로 구조적 정합성을 확인한다. 실제 typecheck/lint/build는 사용자가 로컬에서 돌리거나 Codex에게 맡긴다.
- **줄바꿈(CRLF/LF) 차이는 이 저장소에 원래부터 있던 것**이다. 작업트리는 CRLF, git 커밋 객체는 LF로 저장돼 있어 `git status`가 손대지 않은 파일까지 "modified"로 보여준다. 실제 변경 여부 판단은 항상 `git diff -w`로 한다.
- **이 저장소에는 Claude(Cowork) 외에 Codex로 추정되는 별도 에이전트가 동시에 커밋·푸시하고 있다.** 이는 비정상 상황이 아니라 사용자가 의도적으로 병행 운용하는 협업 구조다. origin과의 병합 충돌이 발생하면, diff의 +/- 기호만으로 방향을 판단하지 말고 `git show <ref>:<path> | grep -c <marker>` 같은 방식으로 양쪽 내용을 직접 비교해서 어느 쪽이 실제로 상위집합인지 확인한 뒤 반영한다.

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

### 8-1. Claude ↔ Codex 역할 분담표

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

## 9. QA Report 형식

Summary(현재 상태 요약) / Findings(발견된 문제) / Root Cause / Severity(P0~P3) / Impact / Recommended Fix / Codex Task / Verification.

## 10. Claude Must Not

원인 확인 없이 코드 수정 / 관련 없는 대규모 리팩터링 / 기존 기능 임의 삭제 / DB schema 임의 변경 / production DB 직접 수정 / 임시 workaround를 최종 해결책으로 사용 / UI에서 DB 오류 숨기기 / 테스트하지 않은 상태에서 "해결됨" 판단.
