# 공개 점주 기본주소 분리 — DB 승인 대기

## 상태

- up 원문은 운영에 1회 적용하고 권한·RLS·기존 데이터 불변을 내부 읽기 기록으로 확인했다. **up 원문을 재실행하지 않는다.** 운영 프로젝트 식별자와 조회 수치는 공개 문서에 기록하지 않는다.
- trigger function ACL 보완은 별도 승인 후 운영에 1회 적용하고 비공개 역할 차단·`service_role` 허용을 내부 읽기로 확인했다. 원문 `docs/sql-drafts/20261110-public-owner-base-address-acl.sql`을 재실행하지 않는다. 운영 식별자와 조회 수치는 공개 문서에 기록하지 않는다.
- `STORE_PUBLIC_OWNER_BASE_ADDRESS_ENABLED`, `FEATURE_STORE_PUBLIC_OWNER_BASE_ADDRESS_COMPANY_IDS`를 포함한 가입 관련 스위치와 회사 목록은 OFF를 유지한다. OFF 또는 회사 목록 밖에서는 기존 v1 RPC만 호출한다.
- up 초안: `docs/sql-drafts/20261110-public-owner-base-address.sql`
- 조건부 down 초안: `docs/sql-drafts/20261110-public-owner-base-address.down.sql`
- 기존 `address`를 분해하거나 기존 행을 백필하지 않는다. 적용 직후 기존 데이터 변경은 0건이어야 한다.

## 적용 전 읽기 점검

1. 대상 프로젝트와 실행 시각을 기록하고 `store_owner_activation_requests`, `normalized_customers`가 존재하는지 확인한다.
2. 두 테이블에 `delivery_base_address`, `delivery_address_detail`이 아직 없는지 확인한다.
3. `complete_public_store_owner_profile_v2(text,text,text,text,text,text,text,text)`와 `copy_public_owner_delivery_address_v1()`이 아직 없는지 확인한다.
4. 가입 기능과 회사별 allowlist가 OFF인지 확인한다. 운영 가입·주문 쓰기는 수행하지 않는다.

## 승인 대상과 적용 순서

1. 애플리케이션 배포보다 먼저 up 초안을 운영 DB에 1회 적용한다. 원문 재실행은 사후 검증을 대신하지 않는다.
2. 두 테이블에 nullable text 2개와 쌍 단위 check constraint가 생겼는지 읽기 확인한다.
3. v2 RPC는 `service_role`만 실행 가능하고 `public`, `anon`, `authenticated`는 실행 불가인지 확인한다.
4. 복사 trigger가 activation request의 `customer_id`가 null에서 값으로 바뀔 때만 실행되는지 정의를 읽는다. update는 `new.company_id`와 `new.customer_id`를 함께 사용하므로 다른 회사 행을 변경하지 않는다.
5. RLS를 우회하는 새 정책이나 grant가 추가되지 않았고 기존 두 테이블의 RLS 상태가 유지되는지 확인한다.
6. 기존 행에서 두 신규 칸이 모두 null이고 변경된 행이 0건인지 확인한 뒤 앱을 배포한다. 앱은 기본 OFF에서 v1을 유지한다. v2 함수·권한 읽기 확인 후에만 전역 스위치와 대상 회사 목록 ON을 별도 승인한다.

## 사후 읽기 검증

- v2 RPC 본문이 기본주소·상세주소를 각각 trim하고, 합본 주소가 `기본주소 + 공백 + 상세주소`와 정확히 같을 때만 저장하는지 확인한다.
- trigger가 기존 분리 주소와 다른 값을 덮어쓰지 않고 `public_store_delivery_address_mismatch`로 전체 활성화를 rollback하는지 확인한다.
- 신규 가입 전에는 `normalized_customers.delivery_base_address`가 null인 기존 매장을 주문 가능으로 해석하지 않는다.

## 되돌리기 제약

- 앱이 v2 RPC를 호출하므로 먼저 앱을 이 변경 이전 버전으로 되돌리고 가입 기능 OFF를 재확인한다.
- 두 테이블 중 어느 곳이든 신규 주소 값이 생긴 뒤에는 down이 의도적으로 실패한다. 값을 합본 주소로 자동 복원하거나 삭제하지 않는다.
- 데이터가 생긴 뒤의 복구는 대상 회사·거래처·활성화 요청을 읽기 확정하고 보존 위치와 주문 영향을 승인받은 수동 계획이 필요하다. 승인 없이 컬럼이나 함수를 drop하지 않는다.
- 데이터가 0건일 때만 down 초안을 실행하고, 함수·trigger·constraint·컬럼 제거와 기존 가입 RPC 정상 여부를 읽기 확인한다.
