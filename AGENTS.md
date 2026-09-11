# AGENTS.md — Codex 공통 작업 규칙

이 파일은 MAJU 저장소에서 작업하는 모든 자동화 에이전트(Codex 등)가 **코드를 한 줄이라도 건드리기 전에** 반드시 읽어야 하는 공통 규칙이다. 페이지별 세부 지침은 `docs/pages/*.md`에 있고, 이 문서와 충돌하면 이 문서가 우선한다.

## 0. 읽는 순서

1. `AGENTS.md` (이 파일)
2. `docs/00_PROJECT_RULES.md`
3. 작업 대상 `docs/pages/<page>.md`
4. Claude가 작성한 Task(있는 경우)

지시가 "`docs/pages/x.md` 실행해"처럼 오더라도, 이 파일은 실행 스크립트가 아니라 **명세서**다. 읽고, 이해하고, 그 범위 안에서만 코드를 수정한다.

`docs/pages/` 안의 정식 파일명은 **kebab-case**(예: `map-and-route.md`, `customers.md`)다. 숫자+영문대문자 형식(예: `01_MAP_HOME.md`)으로 된 파일이 보이면 과거 병행 작업 중 생긴 중복본이니 열어서 상단에 DEPRECATED 배너가 있는지 확인하고, 있으면 무시한 채 배너가 가리키는 kebab-case 파일을 따른다.

## 1. 스코프 규칙

- 각 페이지 md의 **Allowed Files**에 없는 파일은 건드리지 않는다.
- **Do Not Touch**에 명시된 영역은 절대 수정하지 않는다.
- **Preserve**에 적힌 기존 동작은 리팩터링 중에도 깨지면 안 된다.
- 요청받은 페이지 범위를 벗어나는 다른 페이지/도메인이 함께 고쳐야 할 것처럼 보이면, 코드를 고치지 말고 그 사실을 보고만 한다.

## 2. 금지 행동 (Claude Must Not과 동일)

- 원인 확인 없이 코드 수정
- 관련 없는 대규모 리팩터링
- 기존 기능 임의 삭제
- DB schema 임의 변경 (마이그레이션 SQL 파일 추가는 가능하지만, 실제 Supabase DB에 직접 실행하지 않는다 — 사용자가 Supabase SQL Editor에서 직접 실행함)
- production DB 직접 수정
- 임시 workaround를 최종 해결책으로 사용
- UI에서 DB 오류 숨기기 (에러를 삼키거나 무시하지 않는다)
- 테스트/빌드하지 않은 상태에서 "해결됨" 판단
- 커밋 메시지나 코드에 실제 자격증명(API 키, 비밀번호, 토큰)을 남기는 행동

## 3. 작업 후 필수 검증

작업이 끝나면 아래를 **반드시** 실행하고 결과를 보고한다. 하나라도 실패하면 "완료"로 보고하지 않는다.

```
npx tsc --noEmit
npm run lint
npm run build
```

테스트가 있는 영역(`tests/*.test.ts`)을 건드렸다면 `npm test`도 함께 실행한다.

## 4. 이 저장소의 특이사항 (알고 시작할 것)

- **줄바꿈**: 저장소 전체가 작업트리는 CRLF, git 커밋 객체는 LF로 저장되어 있어 `git status`/`git diff`가 실제로 바꾸지 않은 파일까지 "modified"로 표시하는 경우가 흔하다. 실제 변경 여부는 `git diff -w`(공백 무시)로 확인한다. 이 차이 자체를 "고쳐야 할 문제"로 보고 임의로 정규화(renormalize)하지 않는다.
- **동시 작업**: 이 저장소는 사용자, Claude(Cowork), Codex가 같은 GitHub origin(`a01055929144-web/maju-intelligence`)에 동시에 커밋할 수 있다. 작업 시작 전 반드시 `git pull`로 최신 상태를 받고, 커밋 전에도 한 번 더 `git status`로 로컬이 최신인지 확인한다.
- **lib/store.ts는 아직 도메인별로 분리되지 않은 단일 파일**이다(10,000줄 이상, 함수 138개). `docs/02_DOMAIN_MAP.md`가 이 파일 안의 함수들을 논리적으로 어느 도메인 소유인지 정리해둔 지도이니, 새 함수를 추가할 때는 관련 함수들 근처에 위치시키고 02_DOMAIN_MAP.md도 함께 업데이트한다.
- **마이그레이션은 자동 적용되지 않는다.** `supabase/migrations/*.sql` 파일을 새로 추가해도 실제 프로덕션 DB에는 사용자가 Supabase SQL Editor에서 수동 실행해야 반영된다. 이 파일에 의존하는 컬럼/테이블을 코드에서 쓰기 전에, 이미 적용된 마이그레이션인지 사용자에게 확인한다(과거 `20260901_company_message_settings.sql`이 몇 주간 미적용 상태로 남아 설정 저장이 전부 막힌 사례가 있었다).

## 5. 완료 보고 형식

작업이 끝나면 다음을 보고한다.

- **Changed Files**: 실제로 수정한 파일 목록
- **Summary**: 무엇을 왜 바꿨는지 1~2문단
- **Verification**: tsc / lint / build 결과 (PASS/FAIL, FAIL이면 원인)
- **Preserved**: 명세서의 Preserve 항목이 실제로 유지됐는지 확인한 방법
- **Follow-up**: 이번 스코프 밖이라 손대지 않았지만 발견한 이슈(있다면)

이 보고를 받은 Claude가 QA를 진행하므로, 실제로 확인하지 않은 내용을 "정상"이라고 적지 않는다.
