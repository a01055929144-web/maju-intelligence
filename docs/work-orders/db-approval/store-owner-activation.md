# 매장 첫 점주 본인 개통 SQL 승인 대기

상태: 운영 미적용, 기능 OFF. 선행: `20261105-store-kakao-membership.sql` 승인·적용.

2026-11-09 기준 코드 경계 PR #433은 병합됐지만, 카카오 인증을 먼저 수행하는 후속 PR #436과 이 문서의 SQL은 여전히 Draft·운영 미적용이다. #433 병합이나 CI 통과만으로 운영 적용·기능 ON을 승인하지 않는다.

`prepare_store_owner_activation_v1`은 활성 회사 owner/manager가 기존 거래처에 일회용 준비 행만 만들게 한다. 점주 사용자 ID, 약관 수락 시각, 사업 상태는 회사 사용자가 입력하지 않는다.

`prepare_public_store_owner_activation_v1`은 09 서버가 공개 문서 토큰의 서명·만료·회수·발행 회사·게시 버전·가격 기간을 확인한 뒤 07의 5분 가입 의도를 발급한 경우에만 사용한다. RPC도 동일 공유 링크와 문서 버전의 유효성을 다시 읽고 카카오 인증용 미완성 요청만 만든다. 브라우저가 보낸 회사·거래처·매장 ID는 받지 않으며, 서명 nonce를 재시도 키로 사용한다.

카카오 인증을 마치면 15분 HttpOnly 서명 proof에만 인증 사용자와 준비 토큰을 묶고 `/store/activate?profile=1`로 보낸다. 이 단계에는 매장 세션·거래처·매장·owner가 없어 기존 매장 접근과 주문이 불가능하다. `complete_public_store_owner_profile_v1`이 그 proof를 소비한 서버 요청에서만 매장명·대표자·주소·연락처·10자리 사업자번호를 준비 행에 채운다. 기존 거래처나 매장과 사업자번호가 겹치면 자동 연결하지 않고 중단한다.

`activate_store_owner_v1`은 공개 경로에서 카카오 인증 뒤 매장 정보와 약관 동의를 완료한 다음 서버가 호출한다. 5분 이내 국세청 계속사업자 결과와 사업자번호 일치, 활성 `app_users`, 미사용 30분 토큰을 잠근다. 기존 거래처 경로는 기존 방식대로 매장을 만들고, 공개 문서 경로는 거래처·매장·첫 owner·감사 이벤트를 한 트랜잭션에서 만든다. 어느 단계든 실패하면 개통 쓰기는 전부 롤백한다.

세 RPC와 준비 테이블은 RLS를 켜고 service role만 접근한다. 원문 토큰은 DB에 저장하지 않는다. 운영 적용·플래그 활성화는 이 승인표 범위가 아니다.

공개 문서 경로는 `STORE_PUBLIC_OWNER_ONBOARDING_ENABLED`와 `FEATURE_STORE_PUBLIC_OWNER_ONBOARDING_COMPANY_IDS`가 모두 일치해야 하며 기본값은 OFF다. 가입 의도 HMAC에는 별도 `STORE_OWNER_ONBOARDING_SECRET`을 사용한다. 이 초안은 운영 승인·적용 전이며, 기존 점주 개통 SQL 승인에 자동 포함되지 않는다.

## 2026-11-08 운영 읽기 확인

- `store_kakao_membership_20261107` migration 기록과 초대 생성·수락 RPC는 운영에 있다.
- `remove_store_member_v1`은 운영에 있지만 대응 migration `20261108121034` 기록은 없다. 개통 전에 적용 경위와 migration 장부를 정리해야 한다.
- 이 문서의 준비 테이블과 `prepare_store_owner_activation_v1`·`activate_store_owner_v1`은 운영에 없다.
- 활성 매장 계정과 구성원은 0건이며, 운영 Vercel에 `STORE_MEMBER_SESSION_ENABLED`와 `FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS`가 없어 기능은 OFF다.
- `tests/sql/store-member-full-journey.pg17.sql`은 폐기 PG17에서 개통→초대→수락→역할별 주문자 기록→내보내기 직후 차단과 과거 주문자 보존을 검증한다. 이는 운영 SQL 적용·계정 생성·기능 ON 승인이 아니다.

점주 동의 POST는 원문 토큰을 15분 HttpOnly 서명 쿠키에만 저장한다. OAuth state에는 nonce와 회사·매장 UUID만 넣고, 콜백은 state 범위와 토큰 준비 행 범위를 다시 비교한다. 최초 OAuth URL은 `/api/auth/kakao/start?store=1&companyId=<uuid>&storeAccountId=<uuid>&activation=1`, 이후 로그인은 같은 URL에서 `activation=1`만 제거한다.
