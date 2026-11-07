# 매장 카카오 구성원 가입 RPC 승인표

상태: 운영 적용 완료(2026-11-07), 재실행 금지, 기능 OFF. Owner: organization. Related: store, order.

운영 migration history: `20261107075454 store_kakao_membership_20261107`. 저장소 기록:
`supabase/migrations/20261107075454_store_kakao_membership_20261107.sql`.

적용 뒤 읽기 검증에서 FK validated, 활성 구성원·초대 hash UNIQUE 인덱스 2개, RPC 3개의
service_role 전용 실행권, `store_accounts`·`store_account_members`·`store_account_member_events`
RLS ON 및 anon/authenticated SELECT 없음까지 확인했다. 운영 owner·초대 행은 생성하지 않았다.

## 대상

| 파일 | 역할 |
| --- | --- |
| `20261105-store-kakao-membership.sql` | `auth_user_id → app_users.id` 계약, 활성 구성원·초대 hash 유일성, 세 RPC |
| `20261105-store-kakao-membership.down.sql` | 합성 DB용 함수·제약 제거. 구성원 데이터 생성 후 운영 down 금지 |
| `20261105-store-kakao-membership.pg17.test.sql` | owner 경쟁, 초대 재사용, 교차 회사, 동시 수락, RLS·권한 검증 |

## RPC와 승인 경계

- `provision_store_owner_v1`: 같은 회사의 활성 고객사 `owner/manager` 구성원을 DB에서 확인한 뒤 첫 owner 한 명만 개통한다. 임의 승인 문자열이나 공개 카카오 callback 값은 받지 않는다.
- `create_store_member_invitation_v1`: 활성 owner/manager만 직원 초대를 만들며 manager 초대는 owner만 가능하다. 원문 토큰이 아니라 SHA-256 hash만 받는다.
- `accept_store_member_invitation_v1`: 카카오 provider ID를 서버에서 해석한 `app_users.id`와 회사·매장·초대 hash를 함께 잠그고 활성화한다.

세 함수는 단일 DDL 트랜잭션 안에서 `security invoker`로 생성하고 service role에만 실행권을 준다. 공개 링크 토큰, 고객사 `CustomerSession`, URL/body의 사용자 ID를 인증 근거로 쓰지 않는다. 원문 토큰·카카오 토큰·원가값은 로그나 이벤트에 저장하지 않는다.

매장 manager 초대는 매장 owner만 가능하다. 고객사 owner/manager가 매장 manager를 보조 지정하는 기존 결정은 첫 owner 개통과 다른 권한 상승 경로이므로 이 초대 RPC로 우회하지 않는다. 사업자 재확인·사유·`assisted_owner_transfer` 수준의 감사를 포함한 별도 승인 RPC 전까지 보류한다.

## 기존 데이터 영향

- 기존 세 테이블과 행을 재사용하며 백필·삭제하지 않는다.
- `auth_user_id → app_users.id`는 `ON DELETE SET NULL`이다. 사용자 계정 삭제를 막지 않고 구성원·주문 감사를 보존하며, null이 된 활성 행은 이후 카카오 세션 재검증에서 접근할 수 없다. 회사 삭제는 기존 회사 FK cascade를 따라 구성원도 삭제된다.
- `auth_user_id`가 있는 기존 행이 `app_users.id`를 가리키지 않으면 전체 적용을 중단한다.
- 기존 활성 구성원 중복 또는 초대 hash 중복이 있으면 unique index 생성이 실패하고 전체 적용을 롤백한다.
- 초대 만료는 기존 칼럼만 사용해 `invited_at + 7일`로 판정한다.

## 운영 순서

1. 읽기 전용으로 고아 `auth_user_id`, 활성 중복, 초대 hash 중복 건수를 확인한다.
2. 폐기 가능한 PostgreSQL 17에서 up/down과 경쟁 테스트를 통과시킨다.
3. SQL·예상 잠금 시간·복구 방식을 대표가 승인한다.
4. 운영 적용 뒤 함수·제약·grant만 읽기 전용으로 확인한다. 실제 owner/초대 생성 시험은 별도 승인 없이는 하지 않는다.
5. 그 다음에만 07이 매장 Kakao callback과 HttpOnly 세션을 연결하고, 마지막으로 03 원가 API가 세션 helper를 호출한다.

실패 시 기능 플래그를 OFF로 유지하고 매장 OAuth 진입을 노출하지 않는다. 운영 DB에는 이 PR에서 아무것도 실행하지 않는다.
