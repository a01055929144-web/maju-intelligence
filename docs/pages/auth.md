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
2026-09-19 — 기존 인증 경계와 레이트리밋을 포함해 전체 typecheck/lint/build/test 검증 완료.

## BUILD
PASS (`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test -- --run`)

## COMPLETED

- [x] 2026-09-29 회사 운영자·직원 진입 구분, 최근 이메일과 로그인 상태 유지의 개념 분리, 비밀번호 재설정 재요청 UX를 정리했다.
- [x] 로그인 화면 2단 구성 + 고객사 탈퇴(소프트 삭제)
- [x] 카카오/소셜 재로그인 라우팅 버그 수정(다중 회사 소속 케이스 포함)
- [x] 로그인 뷰 워딩 통일, 폐쇄 회사 재활성화 안내
- [x] 로그인 레이트리밋을 영속 저장소(Supabase)로 전환
- [x] 모든 API 라우트의 인증 경계를 CI에서 검사하고, 공개 라우트는 사유와 함께 명시적 허용 목록으로 관리
- [x] `자동 로그인`을 `로그인 상태 유지`로 명확히 바꾸고 공유 PC를 고려해 기본 체크 해제
- [x] 로그인 처리와 카카오 이동 중 진행 상태 표시
- [x] 일일 코스 확정 회사 스코프·관리 권한, 기사 GPS 본인 범위, 전체 배송 히스토리 관리자 게이트를 회귀 테스트로 고정

## TODO
- [ ] 알바(임시) 만료·권한 경계와 동일 계정 동시 2기기 관리자 알림은 `docs/specs/2026-10-29-temporary-access-and-concurrent-session-design.md` 검토 후 단계적으로 구현한다. 현재 문서는 설계 전용이며 운영 DB 적용을 승인하지 않는다.

## KNOWN ISSUES
없음.

## 2026-11-10 매장 점주 재진입

- Owner Domain: organization. Related Domain: pricing (공개 문서 복귀 경로).
- 이번 오류 수정의 허용 파일: `app/api/auth/kakao/callback/route.ts`, `app/api/address-search/route.ts`, `app/api/store/accounts/activate/route.ts`, `components/store-kakao-entry.tsx`, `components/public-pricing-document.tsx`, `lib/store/07-store-member-context.ts`, `tests/store-member-context.test.ts`, `tests/store-kakao-session-boundary.test.ts`, `tests/store-address-search.test.ts`, `tests/e2e/store-kakao-entry.spec.ts`.
- 운영 읽기 확인: 해당 매장 점주 개통과 활성 구성원은 생성됐지만 주문은 0건이었다. 세션이 없는 재방문에서 공개 문서는 다시 개통 요청을 만들었다.
- 카카오 인증 후 같은 회사의 활성 매장 구성원이 정확히 한 곳이면 기존 세션을 발급하고 문서로 복귀한다. 여러 매장 또는 비활성 구성원은 자동 선택하지 않는다. 운영 데이터 변경은 없다.
- 개통 화면은 카카오 주소 검색 결과를 선택하게 하고 상세주소를 별도로 필수 입력한다. 배송 권역은 선택한 카카오 주소로 판정하고, 현재 DB의 단일 주소 칸에는 상세주소를 이어 저장한다. 개통 뒤에는 공유 문서의 주문 연결을 자동으로 다시 시도한다.
- 사업자번호 없는 개업 준비 매장 지원은 현행 `store_accounts` 제약·개통 RPC·회원 주문 RPC가 모두 사업자 정상 상태를 요구하므로 별도 SQL·코드 작업이 필요하다. 임시 사업자번호를 생성하지 않는다. `docs/work-orders/db-approval/20261110-preopening-store.md` 참조.
