# CX-122 파일 소유·충돌 점검

| 선행 작업 | 현재 소유 파일 | CX-122 처리 |
|---|---|---|
| #1073 CX-77 | `lib/feature-flags.ts`, 매장 구성원 API·패널, `07-store-member-management.ts`, 공유 CI·스키마 | 수정하지 않음. 프로필 단위 권한은 병합 후 앱 단계에서 재사용 |
| #1114 CX-126 | `lib/feature-flags.ts`, `app/api/business-partners/route.ts`, 거래처 등록 화면·도메인, 공유 CI·스키마 | 수정하지 않음. 공통 등록·allowlist 소유가 풀릴 때까지 앱 연결 차단 |
| CX-124 | 매출처 새 매장 API·화면·목록, `sales-partner-directory.tsx`, `lib/feature-flags.ts`, 공유 CI·Playwright | 수정하지 않음. "새 매장 확인" 수 표시는 후속 연결로 남김 |
| CX-122 이번 PR | 전용 SQL·down·PG17·승인표·가격 공개 API/화면/시험 | 새 파일만 추가 |

## 앱 단계 차단점

- 기본 OFF·회사 allowlist는 전용 `07-store-price-visibility-feature.ts`에서 엄격하게 검사한다. 공유 `lib/feature-flags.ts` 연결은 소유가 풀린 뒤 한 곳으로 합친다.
- 독립 경로 `/dashboard/settings/store-price-visibility`와 전용 API만 추가했다. 고객사 매장 정보 화면의 진입 링크와 CX-124 "새 매장 확인" 수 연결은 해당 파일 소유가 풀린 뒤 진행한다.
- 09 매장 주문·카탈로그 파일은 수정하지 않는다. 가격 null 진열은 CX-123이 이 공개 판정 함수를 소비한다.

## 이번 앱 경계

- 전역 플래그와 회사 allowlist가 모두 켜진 회사만 접근하며 기본값은 OFF다.
- 서명 고객사 세션의 회사만 조회하고, active 회사 구성원 owner/manager를 서버에서 다시 확인한다.
- 변경 요청 본문의 회사·행위자는 받지 않는다. 매장 ID도 같은 회사 active 매장으로 다시 한정한 뒤 RPC를 호출한다.
- pending/cancel 상태는 이 화면에서도 가격 공개로 표시하지 않는다. 실제 매장 주문·카탈로그의 가격 숨김 연결은 09/CX-123 소유 범위다.

## 검증

- 전용 Vitest 2파일 6건 PASS: 기본 OFF/allowlist, OFF 무조회, staff 거부, 서명 회사 조회, 위조 회사·행위자 무시, cross-origin 쓰기 거부.
- TypeScript, 변경 파일 ESLint, Next production build PASS(기존 경고만).
- 1440/390 Playwright 파일은 추가했으나 이 환경에서 Next 서버가 로컬 포트를 열지 못해 실행 완료하지 못했다. 공유 Playwright/CI 파일은 잠금 때문에 수정하지 않았다.
