# 00. Project Rules

## 프로젝트 개요

MAJU Intelligence — 식자재 유통 회사를 위한 거래처/리드/영업/배송 통합 관리 SaaS. Next.js 15 App Router 기반, Supabase(Postgres + Auth + Storage)를 백엔드로 쓰고 Vercel에 배포한다.

## 저장소 구조

- `C:\maju-deploy` — 메인 작업 저장소. GitHub origin(`https://github.com/a01055929144-web/maju-intelligence.git`)과 동기화되고 Vercel 배포 대상.
- `C:\Users\dyoun\OneDrive\문서\New project\maju-intelligence` — 보조 미러. Claude(Cowork)는 코드를 수정할 때 이 두 폴더를 항상 동일하게 유지한다.
- `C:\maju-deploy\push-latest.bat` — 사용자가 직접 실행하는 배포 스크립트(`git add` → `git commit -F commit-message.txt` → `git pull` → `git push`). Claude는 이 스크립트를 대신 실행하지 않는다.

## 기술 스택

- Next.js 15 (App Router), React, TypeScript
- Tailwind CSS (`maju-section-card`, `maju-card-header`, `maju-stat-card` 등 자체 디자인 시스템 클래스는 `app/globals.css`에 정의)
- Supabase (Postgres, RLS, Storage) — REST 호출은 `lib/store.ts` 내부 `supabaseRequest` 헬퍼로 통일
- Vercel Cron (`vercel.json`에 등록된 두 개: `/api/cron/business-status`, `/api/cron/recommend-refresh`)
- Toss Payments (정기결제/구독)
- Kakao/Naver/Google OAuth 및 지도 API

## DB 마이그레이션 규칙

- 마이그레이션 파일은 `supabase/migrations/*.sql`에 순서대로 추가한다.
- **파일을 추가하는 것과 실제 DB에 반영되는 것은 별개다.** 프로덕션 DB에는 사용자가 Supabase 대시보드의 SQL Editor에서 수동으로 실행해야 반영된다. `npm run ops:migrate`(`scripts/apply-supabase-migrations.mjs`)라는 자동화 스크립트도 있지만 `.env.production.local`의 DB 접속 정보가 필요하고, Claude의 Cowork 샌드박스에는 이 값이 없어 실행할 수 없다.
- 코드가 새 컬럼/테이블에 의존하게 만들기 전에, 관련 마이그레이션이 실제로 적용됐는지 사용자에게 먼저 확인한다. (사례: `20260901_company_message_settings.sql`이 몇 주간 미적용 상태로 남아 회사 설정 저장 기능 전체가 막힌 적이 있음.)

## 코딩 컨벤션

- UI 텍스트는 한국어. 사용자(대표/직원)를 대상으로 한 표현을 쓴다.
- 카드형 레이아웃은 `maju-section-card` + `maju-card-header`(제목 `maju-section-title` + 설명 `maju-muted-label`) 패턴을 따른다. 카드 헤더 제목은 실제 카드 본문 내용과 반드시 일치해야 한다(과거 헤더-본문 불일치 버그가 여러 페이지에서 반복 발견됨).
- 회사 데이터 격리는 `company_id`/`companyId` 컬럼 기준이다. 새 테이블/쿼리를 추가할 때 이 컬럼으로 스코프를 좁히지 않으면 테넌트 간 데이터 유출 위험이 있다. `lib/auth.ts`의 `getRequestAuthScope`가 이 격리를 담당하는 중앙 함수다.

## 검증 방법

- **사용자/Codex**: `npx tsc --noEmit`, `npm run lint`, `npm run build`를 실제로 돌려서 확인한다.
- **Claude(Cowork 세션)**: `npm install`이 샌드박스 제약으로 실패하므로 위 명령을 직접 돌릴 수 없다. 대신 `node ebcheck_tmp2.js <file>`(esbuild 파싱 + JSX 태그 중첩 검증)과 수정 전후 중괄호/괄호 개수 비교로 구조적 정합성을 확인한다. 이 방식은 npm 기반 검증의 대체재이지 완전한 대체가 아니므로, 실제 typecheck/lint/build 결과는 항상 사용자나 Codex를 통해 별도로 확인받는다.

## 협업 구조

사용자, Claude(Cowork), Codex가 같은 저장소/같은 GitHub origin에서 동시에 작업할 수 있다. 작업 시작 전 최신 상태를 받고, 병합 충돌이 생기면 diff 부호만으로 방향을 판단하지 말고 양쪽 커밋의 실제 내용을 직접 비교해서 상위집합 쪽을 채택한다(자세한 방법은 `CLAUDE.md` 참고).

> 이 문서 체계(`docs/`, `AGENTS.md`, `CLAUDE.md`) 자체가 여러 에이전트가 동시에 초안을 만들 수 있는 대상이다. 실제로 2026-09-11에 Claude(Cowork)와 Codex로 추정되는 별도 프로세스가 거의 동시에 각자 다른 형태의 `docs/pages/*.md` 세트를 만든 적이 있다. 이 문서 체계에 구조적 변경(새 파일 추가, 기존 파일 형식 변경)을 하기 전에는 다른 에이전트가 이미 같은 작업을 하지 않았는지 먼저 확인한다.

## Do Not (코드 품질)

- 타입 안전성을 `any`, `@ts-ignore`, 광범위한 타입 단언(`as unknown as X`)으로 우회하지 않는다.
- `company_id`/역할 기반 접근 제어 체크를 약화시키지 않는다.
- Mock 데이터를 실제 데이터인 것처럼 표시하지 않는다.
- API/DB 에러를 UI에서 숨기지 않는다.

## 완료 보고에 포함할 항목

Implemented / Changed Files / DB Changes / Tests / Typecheck / Build / Regression / Remaining Issues. (`AGENTS.md`의 5절 "완료 보고 형식"과 동일한 취지.)
