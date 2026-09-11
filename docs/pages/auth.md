# Auth (로그인 / 가입 / 비밀번호 재설정)

## Status
운영 중. `app/dashboard/login`, `app/admin/login`, `app/signup`, `app/forgot-password`, `app/reset-password`, `app/workspaces`를 포괄.

## Goal
고객사(대표) 자체 로그인/가입, 카카오·네이버·구글 소셜 로그인, 비밀번호 재설정, 여러 워크스페이스 중 선택.

## Owner Domain
organization

## Related Domains
없음

## Allowed Files
- `app/dashboard/login/page.tsx`, `app/admin/login/page.tsx`, `app/signup/page.tsx`
- `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/reset-password/reset-password-form.tsx`
- `app/workspaces/page.tsx`, `components/workspace-selection-panel.tsx`
- `components/oauth-login-buttons.tsx`
- `app/api/auth/**`, `app/api/admin/login/route.ts`, `app/api/customer/login/route.ts`, `app/api/company-signup/route.ts`
- `lib/auth.ts` (테넌트 격리 중앙 함수, `docs/00_PROJECT_RULES.md` 참고)

## Data Flow

| Source | Used For |
|---|---|
| `app_users` | 사용자 계정 |
| `company_members` | 회사 멤버십/권한 |
| OAuth provider id | 카카오/네이버/구글 매핑 |
| `login_throttle_attempts` | 로그인 시도 제한 |

## UX Rules
- 로그인 화면은 "최근 로그인 힌트"와 "자동 로그인 요구"를 구분해서 보여준다.

## Do Not Touch
- `app/mobile/join/**` (직원용 초대 가입 흐름은 mobile-join.md 소관 — 대표/고객사 자체 가입과 다른 화면)

## Preserve
- 회사 이메일 로그인 vs 직원 카카오/모바일 로그인 2단 구성
- 카카오/네이버/구글 재로그인이 여러 회사 소속 중 탈퇴된 회사만 보고 막지 않음(과거 버그 수정됨)
- 로그인 시도 제한이 Supabase 기반으로 실제 분산 환경에서도 작동(인메모리 방식으로 되돌리지 않음)
- 폐쇄된 회사 재활성화 안내 문구

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 카카오/네이버/구글/자체 로그인 4가지 경로 모두 확인

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 로그인 화면 2단 구성 + 고객사 탈퇴(소프트 삭제)
- [x] 카카오/소셜 재로그인 라우팅 버그 수정(다중 회사 소속 케이스 포함)
- [x] 로그인 뷰 워딩 통일, 폐쇄 회사 재활성화 안내
- [x] 로그인 레이트리밋을 영속 저장소(Supabase)로 전환

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
