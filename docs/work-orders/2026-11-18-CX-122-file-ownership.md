# CX-122 파일 소유·충돌 점검

| 선행 작업 | 현재 소유 파일 | CX-122 처리 |
|---|---|---|
| #1073 CX-77 | `lib/feature-flags.ts`, 매장 구성원 API·패널, `07-store-member-management.ts`, 공유 CI·스키마 | 수정하지 않음. 프로필 단위 권한은 병합 후 앱 단계에서 재사용 |
| #1114 CX-126 | `lib/feature-flags.ts`, `app/api/business-partners/route.ts`, 거래처 등록 화면·도메인, 공유 CI·스키마 | 수정하지 않음. 공통 등록·allowlist 소유가 풀릴 때까지 앱 연결 차단 |
| CX-124 | 매출처 새 매장 API·화면·목록, `sales-partner-directory.tsx`, `lib/feature-flags.ts`, 공유 CI·Playwright | 수정하지 않음. "새 매장 확인" 수 표시는 후속 연결로 남김 |
| CX-122 이번 PR | 전용 SQL·down·PG17·승인표 | 새 파일만 추가 |

## 앱 단계 차단점

- 기본 OFF·회사 allowlist를 연결할 `lib/feature-flags.ts`는 #1073/#1114/CX-124 소유가 풀리기 전 수정하지 않는다.
- 고객사 매장 정보 화면과 "새 매장 확인" 수는 CX-124 파일 소유가 풀린 뒤 연결한다.
- 09 매장 주문·카탈로그 파일은 수정하지 않는다. 가격 null 진열은 CX-123이 이 공개 판정 함수를 소비한다.
