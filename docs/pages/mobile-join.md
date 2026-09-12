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
- `lib/auth.ts`(CustomerSession/getCustomerAssignmentKeys — 세션 매칭 키 정의만, 이 파일 전체는 여러 페이지 공용)
- `lib/store.ts`(acceptStaffKakaoInvitation/acceptStaffOAuthInvitation/normalizeInvitedEmployeeName 등 초대 수락 함수만, 이 파일 전체는 God File)

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
2026-09-12

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 회사명 + 마스킹 연락처 기반 가입 흐름 리디자인
- [x] 재로그인 라우팅 버그 수정(여러 회사 소속 중 탈퇴된 회사만 보고 막던 버그 포함)
- [x] 가입완료 시 담당자명/배송차량 자동 매핑 + 수동 연결 UI
- [x] 카카오 고유ID 중복 가입 방지
- [x] 자동 매칭 후보에 "초대 시 입력한 정식 이름" 추가(카카오/네이버/구글 닉네임에 의존하지 않는 매칭)

## TODO
- [ ] GPS 추적 동의 안내 추가 검토(제안됐으나 아직 요청받지 않음, settings.md와 공동)
- [ ] `unmatchedAcceptedCount`(설정 화면 "매칭 안 됨" 배지)를 관리자가 능동적으로 발견해야 하는 구조는 여전함 — 가입 직후 매칭 실패를 관리자에게 알림(예: 대시보드 상단 배너, 알림톡)으로 밀어주는 개선은 이번엔 범위 밖(사용자 확인 후 별도 작업으로 진행 권장)

## KNOWN ISSUES
없음(이번 세션 기준). 아래 FIXED 항목 참고.

## FIXED (2026-09-12)
- **증상**: 카카오톡 초대로 직원이 가입하면, 거래처에 등록된 배송담당자/배송차량과 자동으로 매칭이 안 되어 모바일 코스 화면에 배정된 거래처가 하나도 안 뜨는 경우가 잦음(사용자 보고: "카카오톡 초대 가입시 배송담당자랑 배송차 배송이 매끄럽지 못해"). 관리자가 매번 설정 화면에서 "배정 기준 수동 연결"로 직접 이름/차량을 입력해줘야만 정상 동작함.
- **Root Cause**: `getCustomerAssignmentKeys`(`lib/auth.ts`)가 자동 매칭 후보로 쓰는 `session.name`은 카카오/네이버/구글 프로필의 **실시간 닉네임**입니다(`app/api/auth/kakao/callback/route.ts` 등에서 `kakaoUser.kakao_account?.profile?.nickname`을 그대로 사용). `acceptStaffKakaoInvitation`/`acceptStaffOAuthInvitation`(`lib/store.ts`)도 `displayName = input.name || invitation.employee_name` 순으로, 관리자가 초대 생성 시 입력한 정식 이름(거래처 배송담당자 표기와 실제로 일치하도록 등록한 값)보다 소셜 로그인 닉네임을 항상 우선시합니다. 직원의 카카오 닉네임이 영문/이모지/별명 등 거래처 등록명과 다르면(흔한 경우), 관리자가 아무리 정확한 이름으로 초대를 만들어도 실제 로그인 시점에는 그 이름이 매칭에 전혀 쓰이지 않아 자동 매칭이 실패합니다. 그동안은 "배정 기준 수동 연결"(관리자가 사후에 발견해서 고쳐야 함)만이 유일한 해결 경로였습니다.
- **Trigger**: 초대받은 직원의 카카오/네이버/구글 프로필 닉네임이 거래처의 배송담당자/배송차량 표기와 다를 때(관리자가 초대 시 입력한 정식 이름과는 무관하게 항상 발생 가능).
- **Impact**: 카카오/네이버/구글 3개 로그인 경로 모두 동일하게 영향(코드 패턴이 동일함을 확인). `app/mobile/today`는 이미 "배정된 거래처가 없습니다. 관리자에게 확인해주세요."로 명확히 안내하도록 되어 있어(2026-08-28/2026-09-06 피드백으로 이미 수정됨) 빈 화면이 "매출 0"으로 오인되진 않지만, 실제로 배정이 안 되는 문제 자체는 남아 있었음.
- **Fix**: `StaffKakaoAcceptResult`/`CustomerSession`에 `invitedEmployeeName`(관리자가 초대 생성 시 입력한 정식 이름, "직원"/"모바일 직원" 같은 기본값은 `normalizeInvitedEmployeeName`으로 제외)을 추가하고, `getCustomerAssignmentKeys`의 자동 매칭 후보 목록에 포함시킴. 3개 OAuth 콜백 라우트 모두 `setCustomerSession`에 이 값을 함께 넘기도록 수정. 표시용 이름(`session.name`, 인사말 등에 쓰이는 실제 닉네임)은 그대로 유지하고, **매칭 후보만** 추가하는 방식이라 기존 동작(닉네임 매칭, 수동 override)은 전부 그대로 보존됨 — 관리자가 애초에 거래처 담당자 표기와 같은 이름으로 초대를 만들었다면 이제 닉네임이 무엇이든 수동 개입 없이 바로 매칭됩니다.
- **Regression Risk**: 낮음. 순수 추가(additive) 변경 — 기존 매칭 키(userId/name/email/assignedManagerName/assignedVehicle)는 그대로 두고 후보 하나만 늘림. `normalizeInvitedEmployeeName`이 기본값("직원"/"모바일 직원")을 걸러내 우연한 오매칭 위험도 차단. `matchesAssignmentKey`의 부분일치는 두 값 모두 5자 이상일 때만 적용되므로, 일반적인 2~4자 한글 이름은 정확히 일치할 때만 매칭됨(기존 session.name 매칭과 동일한 안전 기준).
- **Test Scenario(사용자 확인 필요)**: 거래처에 배송담당자="김철수"로 등록 → 관리자가 초대 생성 시 이름을 "김철수"로 입력 → 실제 카카오 계정 닉네임은 "chulsoo92" 같은 전혀 다른 값으로 로그인 → 수동 연결 없이도 해당 거래처가 모바일 코스에 바로 뜨는지 확인. 기존 수동 연결(assignedManagerName/assignedVehicle) 기능과 닉네임이 우연히 일치하는 기존 케이스는 회귀 없는지 함께 확인.
- **Verification**: 클라우드 클론에서 `npx tsc --noEmit` PASS, `npm run build` PASS(`/mobile/join`, `/mobile/today`, `/dashboard/settings` 라우트 정상 포함), `npm test`(vitest 28건) 전부 PASS. `C:\maju-deploy`에서 `node ebcheck_tmp2.js`로 6개 수정 파일 모두 OK, `git show HEAD` 대비 중괄호/괄호/대괄호 균형 비교로 구조적 정합성 확인, 두 저장소 diff가 완전히 동일함을 확인. **실제 카카오/네이버/구글 로그인으로 가입 흐름을 직접 실행해보지는 못했음 — 사용자 테스트 필요.**
- **Files**: `lib/auth.ts`, `lib/store.ts`, `app/api/auth/kakao/callback/route.ts`, `app/api/auth/naver/callback/route.ts`, `app/api/auth/google/callback/route.ts` (5개 전부 `push-latest.bat` git add 목록에 이미 포함).
- **참고(이번엔 범위 밖)**: 관리자가 "배정 기준 수동 연결"이 필요한 케이스(정식 이름조차 거래처 등록명과 다른 경우)를 여전히 사후에 직접 발견해야 하는 구조는 그대로입니다. 위 TODO 참고.
