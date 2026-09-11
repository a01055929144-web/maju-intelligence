# Admin (관리자 콘솔)

## Status
운영 중. `app/admin/*` 하위 여러 서브페이지(accounts, billing, companies, login, system, uploads)를 포괄.

## Goal
MAJU 운영자가 고객사 계정, 구독/결제, 시스템 상태, 업로드 기록을 관리한다.

## Owner Domain
organization

## Related Domains
analytics (system 페이지), sales(billing)

## Allowed Files
- `app/admin/**` (accounts, billing, companies, login, system, uploads, page.tsx, admin-page-header.tsx, logout-button.tsx)
- `app/admin/companies/workspace.tsx`, `app/admin/uploads/workspace.tsx`
- `app/api/admin/**`

## Data Flow

| Source | Used For |
|---|---|
| `companies` | 고객사 목록/상태 |
| `uploaded_files` / upload 이력 | 업로드 이력 확인 |
| `admin_audit_logs` | 감사 로그 |
| 시스템 진단(`getSystemDiagnostics`) | 환경/DB/API 점검 |
| 구독/결제 테이블 | 과금 상태 |

## UX Rules
- 관리자 화면은 진단과 조치 버튼 중심으로 구성한다.
- 고객사별 문제를 빠르게 필터링할 수 있어야 한다.
- 위험한 조치(완전 삭제 등)는 명확한 확인 절차를 둔다.

## Do Not Touch
- 고객(customer) 로그인 세션 관련 코드 — admin 세션과 customer 세션은 분리되어 있으므로 섞지 않는다.

## Preserve
- 고객사 완전 삭제(hard delete)는 이미 탈퇴(소프트 삭제) 상태인 회사만 가능(안전장치)
- 관리자 감사 로그(`admin_audit_logs`) 기록
- map-diagnostics, 구 디버그 라우트류는 관리자 인증 필수(비인증 접근 차단됨 — 다시 열지 않는다)

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 관리자 인증 없이 접근 시 차단되는지 확인

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 고객사 완전 삭제(hard delete, 탈퇴 상태 선행 요구)
- [x] 관리자 거래처 목록 표 정렬
- [x] 비인증 프록시 API 인증/레이트리밋 추가, map-diagnostics 관리자 인증 추가
- [x] 임시 디버그 라우트 제거

## TODO
- [ ] (없음, 새 요청 시 추가)

## KNOWN ISSUES
없음.
