# QA Report — Settings 페이지 마이그레이션 미적용 위험 전수 감사

## Summary
`docs/pages/settings.md`의 KNOWN ISSUES에 "과거 마이그레이션 미적용으로 저장 기능 전체가 막힌 전력이 있음, 확인 필요"로만 남아 있던 위험을, 이 페이지가 의존하는 6개 최근 마이그레이션 각각에 대해 코드 레벨에서 실패 처리 방식을 확인했다. 결론: **5개는 이미 안전하게 처리되어 있었고, 1개(`assigned_manager_name`/`assigned_vehicle`)만 진단 메시지가 없어 보강했다.** 실제 프로덕션 Supabase에 6개가 전부 적용됐는지는 이 세션에서 DB에 직접 접속할 수 없어 확인하지 못했다 — 이 보고서는 "적용 안 됐을 때 무슨 일이 일어나는가"를 코드 기준으로 검증한 것이다.

## Findings

대상 마이그레이션 6개와 각각을 사용하는 `lib/store.ts` 함수, 컬럼/테이블이 없을 때의 실제 동작:

| 마이그레이션 | 사용처 | 컬럼/테이블 없을 때 동작 | 상태 |
|---|---|---|---|
| `20260901_company_message_settings.sql` | `updateCompanySettings` (문자 발송/알림 설정 저장) | catch에서 `isMissingColumnError` 확인 → 해당 컬럼들만 빼고 재시도, 단 저장하려던 값이 있었으면 "supabase/migrations/20260901_company_message_settings.sql 내용을 먼저 실행하세요" 에러 | ✅ 안전 |
| `20260907_staff_assignment_override.sql` | `staffStoreRequest`를 거치는 모든 초대 코드 조회/수정(초대 목록, 초대 수락, 모바일 카카오 로그인 등, 6곳 이상) | `normalizeStaffStoreError`가 `isMissingStaffInvitationTableError`(테이블 전체 누락)와 `isInvalidSupabaseApiKeyError`만 특별 처리하고, 이 두 컬럼이 없는 경우는 원인 불명의 Supabase 원본 에러(`column ... does not exist` 등)를 그대로 노출 — **진단 불가** | ⚠️ 발견 → 수정함(아래) |
| `20260907b_company_job_titles.sql` | `getCompanyJobTitles`(조회), `addCompanyJobTitle`(저장) | 조회: `isMissingCompanyJobTitlesTableError` → 빈 배열로 안전 폴백. 저장: 같은 체크 → "supabase/migrations/20260907b_company_job_titles.sql을 먼저 실행하세요" 에러 | ✅ 안전 |
| `20260907c_company_closure.sql` | `closeCompanyAccount`(고객사 탈퇴) | `isMissingColumnError`면 `closed_at`/`closed_by` 없이 `status="closed"`만 재시도 — 탈퇴로 인한 로그인 차단이라는 핵심 효과는 마이그레이션 여부와 무관하게 반드시 적용됨 | ✅ 안전(가장 신중하게 설계된 폴백) |
| `20260907d_login_throttle.sql` | `lib/rate-limit.ts`의 `checkLoginThrottle` 등 | `supabaseThrottleRequest`가 fetch 실패/비정상 응답을 전부 `catch`해서 `null` 반환 → 자동으로 메모리 기반 제한으로 폴백(로그인 자체는 계속 동작, 다만 서버리스 인스턴스 간 공유는 안 됨) | ✅ 안전 |
| `20260907e_permit_sync_cursor.sql` | `syncAllCompaniesGovRestaurantLeads`, `syncAllCompaniesSeoulRestaurantLeads`(일일 cron) | 회사 목록 조회에 `.catch(() => [])`, 커서 저장에 `.catch(() => null)` — 컬럼이 없으면 조용히 "처리된 회사 0곳"으로 정상 반환. cron 라우트의 `Promise.all` 전체를 reject시키지 않음 | ✅ 안전 |

## Root Cause (발견된 1건)

`staff_invitations.assigned_manager_name`/`assigned_vehicle`(카카오 닉네임과 등록된 담당자명이 달라 자동 매칭이 실패하는 경우를 위한 수동 배정, `20260907_staff_assignment_override.sql`)는 초대 코드 조회의 `select=` 쿼리 문자열에 다른 컬럼들과 함께 하드코딩되어 있다. 이 두 컬럼이 없으면 PostgREST가 `42703`류 에러를 반환하는데, 이 요청들을 감싸는 공용 헬퍼 `staffStoreRequest`/`normalizeStaffStoreError`는 "테이블 전체가 없는 경우"(`isMissingStaffInvitationTableError`)만 잡고 "컬럼 일부가 없는 경우"는 잡지 않아, 원본 Supabase 에러 문자열이 그대로 사용자/로그에 노출됐다. 다른 5개 마이그레이션은 전부 동일한 패턴(`isMissingColumnError`/전용 체크 함수)으로 이미 처리돼 있었던 것과 비교하면 이 부분만 빠져 있던 것으로 보인다.

## Severity
**P2** (`CLAUDE.md` 3절 기준: 실제 데이터 손실/오염은 없고, 마이그레이션이 적용된 정상 상태에서는 아무 영향이 없다. 다만 마이그레이션이 누락된 상태에서는 "직원 초대 링크로 들어오는 모든 진입점"이 원인 불명의 에러로 막히므로, 그 조건이 실제로 발생하면 체감 심각도는 높다 — 진단 가능성 문제로 P2 분류).

## Impact
- `app/dashboard/settings/staff-management-panel.tsx`(직원 초대 목록/수정)
- `app/mobile/**`의 초대 코드 기반 카카오 가입/로그인 흐름(mobile-join.md/mobile-register.md 관련) — 이 마이그레이션이 없으면 새 직원이 초대 링크로 아예 합류하지 못할 수 있음
- 데이터 손실/오염 없음(select/patch 대상 컬럼이 존재하지 않을 뿐, 기존 데이터는 영향 없음)

## Recommended Fix (적용 완료)
`lib/store.ts`에 `isMissingStaffAssignmentOverrideColumnError(error)`를 추가하고, `normalizeStaffStoreError`에서 `isMissingStaffInvitationTableError` 다음 순서로 이를 확인해 "supabase/migrations/20260907_staff_assignment_override.sql을 먼저 실행하세요"라는 명확한 한글 에러로 치환하도록 했다. **동작 자체는 바뀌지 않는다** — 마이그레이션이 없으면 여전히 해당 기능은 실패한다(이것이 맞는 동작이다: CLAUDE.md 10절 "UI에서 DB 오류 숨기기" 금지). 바뀌는 것은 실패했을 때 "왜" 실패했는지 즉시 알 수 있다는 점뿐이다.

## Codex Task
해당 없음 — 순수 진단 메시지 추가로 이미 이 세션에서 구현 완료(`lib/store.ts` 17줄 추가, 기존 로직 변경 없음). Codex가 별도로 할 일은 없다.

## Verification
- `npx tsc --noEmit` 수준의 전체 typecheck는 이 세션에서 `npm install`이 막혀 있어 실행 불가 — 대신 전역 설치된 `tsc`(6.0.3)로 `lib/store.ts` 단독 구문 검사(TS1xxx 계열 에러) 0건 확인, 수정 전/후 중괄호·괄호 개수 비교로 구조적 정합성 확인(둘 다 정상적으로 1쌍만 증가).
- **남은 일(사용자/Codex 확인 필요)**: (1) 실제 `npm run lint`/`npm run build` 로컬 실행 (2) 프로덕션 Supabase에 6개 마이그레이션이 실제로 전부 적용됐는지 SQL Editor에서 직접 확인 — 이 세션은 DB 접속 권한이 없어 코드상 "적용 안 됐을 때 안전한가"만 검증했고 "실제로 적용됐는가"는 검증하지 못했다.
