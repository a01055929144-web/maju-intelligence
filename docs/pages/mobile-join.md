# Mobile Join (모바일 직원 가입)

## Status
운영 중.

## Goal
초대받은 직원이 모바일에서 카카오/네이버/구글 로그인 또는 마스킹된 연락처 인증으로 가입을 완료한다.

## Owner Domain
organization

## Related Domains
delivery (가입 완료 시 담당자명/배송차량 자동 매핑)

## Allowed Files
- `app/mobile/join/page.tsx`
- `components/oauth-login-buttons.tsx`
- `app/api/staff/invite-preview/route.ts`
- `app/api/auth/kakao/**`, `app/api/auth/naver/**`, `app/api/auth/google/**`

## Data Flow

| Source | Used For |
|---|---|
| `staff_invitations` | 초대 유효성/만료 확인 |
| OAuth provider id | 카카오/네이버/구글 매핑 |
| `company_members` | 가입 완료 후 멤버십 생성 |

## Do Not Touch
- `app/dashboard/settings/**` (초대 생성 쪽은 settings.md 소관, 여긴 초대 수락 쪽만)

## Preserve
- 회사명 + 마스킹된 연락처로 먼저 확인시키는 흐름(원본 초대코드를 그대로 노출하지 않음)
- 이미 수락된 초대 링크 재클릭 시 재로그인 정상 처리(과거 반복 실패 버그 수정됨)
- 가입 완료 시 담당자명/배송차량 자동 매핑 + 수동 연결 UI
- 카카오 고유ID 중복 가입 방지

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 초대 링크 최초 수락 + 재클릭 두 경로 모두 확인

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-11

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 회사명 + 마스킹 연락처 기반 가입 흐름 리디자인
- [x] 재로그인 라우팅 버그 수정(여러 회사 소속 중 탈퇴된 회사만 보고 막던 버그 포함)
- [x] 가입완료 시 담당자명/배송차량 자동 매핑 + 수동 연결 UI
- [x] 카카오 고유ID 중복 가입 방지

## TODO
- [ ] GPS 추적 동의 안내 추가 검토(제안됐으나 아직 요청받지 않음, settings.md와 공동)

## KNOWN ISSUES
없음.
