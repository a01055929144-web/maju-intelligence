# 매장 첫 점주 본인 개통 SQL 승인 대기

상태: 운영 미적용, 기능 OFF. 선행: `20261105-store-kakao-membership.sql` 승인·적용.

`prepare_store_owner_activation_v1`은 활성 회사 owner/manager가 기존 거래처에 일회용 준비 행만 만들게 한다. 점주 사용자 ID, 약관 수락 시각, 사업 상태는 회사 사용자가 입력하지 않는다.

`activate_store_owner_v1`은 점주가 일회용 링크에서 약관에 동의하고 카카오 본인 인증을 마친 뒤 서버가 호출한다. 5분 이내 국세청 계속사업자 결과와 거래처 사업자번호 일치, 활성 `app_users`, 미사용 30분 토큰을 잠근 뒤 `store_accounts`를 만들고 기존 `provision_store_owner_v1`으로 첫 owner를 생성한다. 어느 단계든 실패하면 한 트랜잭션으로 롤백한다.

두 RPC와 준비 테이블은 RLS를 켜고 service role만 접근한다. 원문 토큰은 DB에 저장하지 않는다. 운영 적용·플래그 활성화는 이 승인표 범위가 아니다.

## 2026-11-08 운영 읽기 확인

- `store_kakao_membership_20261107` migration 기록과 초대 생성·수락 RPC는 운영에 있다.
- `remove_store_member_v1`은 운영에 있지만 대응 migration `20261108121034` 기록은 없다. 개통 전에 적용 경위와 migration 장부를 정리해야 한다.
- 이 문서의 준비 테이블과 `prepare_store_owner_activation_v1`·`activate_store_owner_v1`은 운영에 없다.
- 활성 매장 계정과 구성원은 0건이며, 운영 Vercel에 `STORE_MEMBER_SESSION_ENABLED`와 `FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS`가 없어 기능은 OFF다.
- `tests/sql/store-member-full-journey.pg17.sql`은 폐기 PG17에서 개통→초대→수락→역할별 주문자 기록→내보내기 직후 차단과 과거 주문자 보존을 검증한다. 이는 운영 SQL 적용·계정 생성·기능 ON 승인이 아니다.

점주 동의 POST는 원문 토큰을 15분 HttpOnly 서명 쿠키에만 저장한다. OAuth state에는 nonce와 회사·매장 UUID만 넣고, 콜백은 state 범위와 토큰 준비 행 범위를 다시 비교한다. 최초 OAuth URL은 `/api/auth/kakao/start?store=1&companyId=<uuid>&storeAccountId=<uuid>&activation=1`, 이후 로그인은 같은 URL에서 `activation=1`만 제거한다.
