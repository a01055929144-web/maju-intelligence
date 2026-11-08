# 매장 첫 점주 본인 개통 SQL 승인 대기

상태: 운영 미적용, 기능 OFF. 선행: `20261105-store-kakao-membership.sql` 승인·적용.

`prepare_store_owner_activation_v1`은 활성 회사 owner/manager가 기존 거래처에 일회용 준비 행만 만들게 한다. 점주 사용자 ID, 약관 수락 시각, 사업 상태는 회사 사용자가 입력하지 않는다.

`activate_store_owner_v1`은 점주가 일회용 링크에서 약관에 동의하고 카카오 본인 인증을 마친 뒤 서버가 호출한다. 5분 이내 국세청 계속사업자 결과와 거래처 사업자번호 일치, 활성 `app_users`, 미사용 30분 토큰을 잠근 뒤 `store_accounts`를 만들고 기존 `provision_store_owner_v1`으로 첫 owner를 생성한다. 어느 단계든 실패하면 한 트랜잭션으로 롤백한다.

두 RPC와 준비 테이블은 RLS를 켜고 service role만 접근한다. 원문 토큰은 DB에 저장하지 않는다. 운영 적용·플래그 활성화는 이 승인표 범위가 아니다.

## 운영 읽기 확인 (2026-11-09 재확인)

| 경계 | 운영 객체 | migration 장부 | 판정 |
|---|---|---|---|
| 구성원 초대·수락 | 두 RPC 있음, service role만 실행 | `20261107075454` 있음 | 적용 확인 |
| 구성원 내보내기 | `remove_store_member_v1` 있음, service role만 실행 | `20261108121034` 없음 | 적용 경위 확인 대기 |
| 회원 주문 | `place_store_member_order` 있음, service role만 실행 | `20261108141800` 없음 | 적용 경위 확인 대기 |
| 최초 점주 개통 | 준비 테이블과 준비·개통 RPC 모두 없음 | 적용 기록 없음 | 운영 미적용 |

활성 매장 계정·활성 구성원·회원 주문은 모두 0건이다. 운영 Vercel에는 `STORE_MEMBER_SESSION_ENABLED`와 `FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS`가 없어 기능은 OFF다. 객체가 존재해도 migration 장부가 없으면 적용 완료로 판정하지 않으며, 0건은 실사용 완료 증거로 세지 않는다.

`tests/sql/store-member-full-journey.pg17.sql`은 폐기 PG17에서 개통→초대→수락→역할별 주문자 기록→내보내기 직후 차단과 과거 주문자 보존을 검증한다. 이는 운영 SQL 적용·계정 생성·기능 ON 승인이 아니다. Stage C 구현 체크는 5/8을 유지한다.

## 운영 개통 승인 게이트

아래 네 게이트는 순서대로 각각 승인한다. 앞 단계의 읽기 검증이 끝나지 않으면 다음 단계로 넘어가지 않는다.

1. **migration 장부 정합성**: 운영 `remove_store_member_v1`의 정의·권한과 저장소 SQL을 비교하고, 기존 적용 시각·실행자·원본 SQL을 확인한다. 함수가 이미 있다는 이유로 migration을 재실행하거나, 사후에 적용 기록만 임의로 추가하지 않는다. 정의나 출처가 일치하지 않으면 별도 조정 migration을 작성해 다시 승인받는다.
2. **첫 점주 개통 SQL 적용**: 대상 Supabase 프로젝트와 실행 시각을 적은 `DB-APPROVED`를 받은 뒤 준비 테이블과 `prepare_store_owner_activation_v1`·`activate_store_owner_v1`을 1회 적용한다. 적용 후 migration 기록, 함수 정의·권한, RLS와 service role 경계를 읽기로 확인한다.
3. **전용 테스트 계정 실검증**: 별도 실행 승인을 받고 지정한 테스트 거래처·카카오 계정만 사용한다. 첫 owner 개통, manager/staff 초대·수락, 역할별 주문자 기록, 내보내기 직후 차단, 과거 주문자·감사 기록 보존을 확인하고 폐기 방법과 결과를 기록한다.
4. **회사별 기능 ON**: 별도 배포 승인을 받은 뒤 전역 플래그와 대상 회사 allowlist를 함께 설정한다. 재배포와 smoke test 후 문제가 있으면 플래그를 다시 OFF하고 allowlist에서 회사를 제거한다.

다음 중 하나라도 확인되면 즉시 중단한다: 운영 함수 정의가 저장소 SQL과 다름, 기존 적용 경위를 확인할 수 없음, 예상하지 않은 활성 매장/구성원 행이 존재함, RLS 또는 함수 권한이 승인안과 다름, 기능 플래그가 사전 승인 없이 켜져 있음. 이때는 운영 데이터를 수정하지 않고 읽기 결과만 승인표에 남긴다.

현재 판정은 **합성 구현 검증 완료, 운영 개통 미완료**다. PG17 전체 여정 성공은 2~4번 게이트를 대체하지 않는다.

점주 동의 POST는 원문 토큰을 15분 HttpOnly 서명 쿠키에만 저장한다. OAuth state에는 nonce와 회사·매장 UUID만 넣고, 콜백은 state 범위와 토큰 준비 행 범위를 다시 비교한다. 최초 OAuth URL은 `/api/auth/kakao/start?store=1&companyId=<uuid>&storeAccountId=<uuid>&activation=1`, 이후 로그인은 같은 URL에서 `activation=1`만 제거한다.
