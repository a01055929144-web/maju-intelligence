> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/admin.md`를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 08. 플랫폼 관리자 운영 | Admin Operations

## PAGE TITLE

플랫폼 관리자 운영

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Admin operations package v1

## STATUS SUMMARY

플랫폼 관리자 화면, 고객사 관리, 업로드 상태, 시스템 점검, 과금/계정 관리를 담당한다.

## GOAL

MAJU 운영자가 고객사 상태, 업로드, 시스템 연결, 과금, 감사 로그를 빠르게 점검하고 조치한다.

## OWNER DOMAIN

admin

## RELATED DOMAINS

organization, customer, analytics, sales

## PRIMARY ROUTES

- `/admin`
- `/admin/companies`
- `/admin/accounts`
- `/admin/uploads`
- `/admin/system`
- `/admin/billing`
- `/admin/login`

## ALLOWED FILES

- `app/admin/page.tsx`
- `app/admin/companies/page.tsx`
- `app/admin/companies/workspace.tsx`
- `app/admin/accounts/page.tsx`
- `app/admin/uploads/page.tsx`
- `app/admin/uploads/workspace.tsx`
- `app/admin/system/page.tsx`
- `app/admin/billing/page.tsx`
- `app/api/admin/*`

## DO NOT TOUCH

- Customer-facing page layout unless admin link behavior is explicitly in scope
- `app/api/auth/**` unless admin auth is explicitly in scope
- `supabase/**` unless admin schema changes are explicitly requested

## PRESERVE

- Existing admin login
- Existing company list
- Existing upload diagnostics
- Existing system diagnostics
- Existing audit log behavior

## COMPLETED

- [x] 관리자 로그인
- [x] 고객사 관리
- [x] 업로드/분석 이력
- [x] 시스템 점검
- [x] 계정/과금 기본 화면

## TODO

- [ ] 고객사별 데이터 연결 진단 강화
- [ ] 위험 조치 확인 UX 정리
- [ ] API/환경변수 누락 상태 더 명확화
- [ ] 운영 이슈 필터링 강화
- [ ] 고객사 상태 요약과 상세 연결 개선

## Data Flow

| Source | Used For |
| --- | --- |
| companies | 고객사 목록 |
| upload_history | 업로드 이력 |
| admin_audit_logs | 감사 로그 |
| system diagnostics | 환경/DB/API 점검 |
| billing tables/API | 과금 상태 |

## UX RULES

- 관리자 화면은 진단과 조치 버튼 중심으로 구성한다.
- 고객사별 문제를 빠르게 필터링할 수 있어야 한다.
- 운영 중 위험한 조치는 명확한 확인 절차를 둔다.

## VERIFICATION

- 관리자 로그인
- 고객사 목록/상세
- 업로드 이력
- 시스템 점검
- 감사 로그
- 권한 없는 접근 차단
