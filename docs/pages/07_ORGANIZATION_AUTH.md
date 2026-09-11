> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/settings.md` + `docs/pages/auth.md` + `docs/pages/mobile-join.md`를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 07. 회사·직원·로그인 권한 | Organization Auth

## PAGE TITLE

회사·직원·로그인 권한

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Organization auth package v1

## STATUS SUMMARY

회사 설정, 직원 관리, 카카오/이메일 로그인, 권한, 회사별 데이터 격리를 담당한다.

## GOAL

개인/회사 계정, 카카오/이메일 로그인, 직원 매핑, 권한, 담당 거래처 노출 범위를 안전하게 관리한다.

## OWNER DOMAIN

organization

## RELATED DOMAINS

customer, delivery, route, admin

## PRIMARY ROUTES

- `/dashboard/settings`
- `/dashboard/login`
- `/mobile/join`
- `/signup`
- `/workspaces`
- `/forgot-password`
- `/reset-password`

## ALLOWED FILES

- `app/dashboard/settings/page.tsx`
- `app/dashboard/settings/settings-form.tsx`
- `app/dashboard/settings/staff-management-panel.tsx`
- `app/dashboard/login/page.tsx`
- `app/mobile/join/page.tsx`
- `app/signup/page.tsx`
- `app/workspaces/page.tsx`
- `app/api/auth/*`
- `app/api/customer/*`
- `lib/auth.ts`
- `lib/workspace.ts`

## DO NOT TOUCH

- `app/admin/**` unless platform admin account management is explicitly in scope
- `components/sales-route-map-workspace.tsx` unless permission reflection is explicitly in scope
- `app/revenue/**`
- `supabase/**` unless auth schema changes are explicitly requested

## PRESERVE

- Existing email login
- Existing OAuth callback routes
- Existing staff invitations
- Existing company settings
- Existing workspace selection

## COMPLETED

- [x] 이메일 로그인
- [x] 카카오/네이버/구글 OAuth route skeleton
- [x] 직원 초대 화면
- [x] 회사 설정 화면
- [x] 모바일 가입 화면 간소화

## TODO

- [ ] 카카오 고유 ID 기반 직원 매핑 정확도 검증
- [ ] 직원 추가/편집/삭제/해제 관리 UX 완성
- [ ] 담당자별 거래처 노출 제한 전수 점검
- [ ] 자동 로그인과 최근 로그인 힌트 개념 분리
- [ ] 모바일 가입 후 회사/담당자 연결 결과 명확화

## Data Flow

| Source | Used For |
| --- | --- |
| app_users | 사용자 계정 |
| company_members | 회사 멤버십/권한 |
| staff_invitations | 직원 초대 |
| OAuth provider id | 카카오/네이버/구글 매핑 |
| companies | 회사 설정 |

## UX RULES

- 로그인 화면은 최근 로그인 힌트와 실제 자동 로그인 요구를 구분한다.
- 직원 관리는 추가, 편집, 해제, 삭제가 명확해야 한다.
- 권한은 기능 제한보다 노출 데이터 범위 중심으로 설계한다.

## VERIFICATION

- 이메일 로그인
- 카카오 로그인
- 초대 수락
- 직원 매핑
- 회사 전환
- 권한별 데이터 노출
