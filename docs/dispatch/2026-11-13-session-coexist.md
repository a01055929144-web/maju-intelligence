# CC-39 관리자·운영·매장 로그인 동시 유지 (2026-11-13 17:55 대표) — 작은 버그 수정

> 컨트롤타워 원인 확인 · 담당 Claude Code. Owner `organization`(인증). DB 없음. P2(같은 브라우저에서 사이트를 오갈 때마다 다시 로그인).

## 대표 증상

"관리자·운영·매장 3사이트를 (동시에) 로그인 못 하더라. 다른 데 로그인하면 풀리던데."

## 원인 (코드 확인)

세션 쿠키는 이미 셋으로 나뉘어 있음(`maju_admin_session` · `maju_customer_session` · `maju_store_session`, `lib/auth.ts` 86~88줄). 그런데 **로그인·로그아웃 API가 다른 사이트 쿠키까지 지움**:

| 파일 | 지금 하는 일 |
| --- | --- |
| `app/api/customer/login/route.ts:26` | 운영 로그인 시 **관리자 세션 삭제** |
| `app/api/admin/login/route.ts:26` | 관리자 로그인 시 **운영 세션 삭제** |
| `app/api/company-signup/route.ts:41` | 회사 가입 시 관리자 세션 삭제 |
| `app/api/customer/logout/route.ts` | 운영 로그아웃 시 **관리자·운영·매장 셋 다 삭제** |
| `app/api/admin/logout/route.ts` | 관리자 로그아웃 시 관리자·운영 삭제 |

세션을 읽는 쪽(`getAdminSession`·`getCustomerSession`·매장 세션)은 각자 자기 쿠키만 보므로 함께 있어도 권한이 섞이지 않음.

## 고칠 것

1. 로그인·가입: **자기 쿠키만 설정**, 다른 사이트 쿠키 삭제 제거(위 3곳).
2. 로그아웃: **자기 쿠키만 삭제**(운영 → 운영만, 관리자 → 관리자만). 매장은 지금처럼 매장만.
3. 공용 PC 대비: 각 로그아웃 메뉴 아래 작은 링크 **"이 브라우저의 모든 MAJU 로그인 해제"** → 새 `POST /api/auth/logout-all`(셋 다 삭제).
4. 그대로 둘 것: 비밀번호 변경 시 관리자·운영 세션 삭제(`change-password`, 보안상 유지) · 세션 버전 검사.
5. 같은 사람이 관리자·운영 둘 다일 때 화면 위에 지금 어느 사이트인지 이미 표시되는지 확인(없으면 머리 줄에 `관리자`/`운영`/`매장` 작은 배지).

## Done

- 단위: 각 로그인 API가 다른 쿠키를 건드리지 않음 · 각 로그아웃이 자기 쿠키만 · logout-all은 셋 다.
- e2e(1440): 관리자 로그인 → 같은 브라우저 운영 로그인 → `/admin`·`/dashboard` 둘 다 열림 → 매장 세션(테스트 계정)으로 `/store`도 열림 → 운영 로그아웃 후에도 `/admin` 열림 → 모두 해제 후 셋 다 로그인 화면.
- `npm run check:auth-boundaries` 통과. CI · Ponytail. 현황판은 묶음 갱신 때.
