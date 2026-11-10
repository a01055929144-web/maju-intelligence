# 개업 준비 매장 가입·주문 — DB 변경 설계 (승인 전 실행 금지)

## 현재 막힘

매장 카카오 인증은 가능하지만 `store_owner_activation_requests`의 완성 프로필 검사, `complete_public_store_owner_profile_v1`, `activate_store_owner_v1`, `store_accounts` 제약이 사업자번호 10자리와 정상 사업자 검증을 강제한다. 회원 조회와 주문 RPC도 `business_status='active'`만 허용한다. 따라서 번호 없는 매장에 임시 번호를 넣거나 앱 검사만 해제하면 실제 가입·주문은 실패한다.

## 제안하는 최소 변경

1. `store_owner_activation_requests`의 공개 프로필 완성 조건을 번호가 있거나 없는 두 경우로 확장한다. 번호가 있으면 기존 국세청 정상 사업자 확인을 유지한다. 번호가 없으면 `business_registration_number=null`을 유지한다.
2. `store_accounts.business_registration_number`, `business_status_verified_at`, `verification_request_id`는 개업 준비 상태에서만 null을 허용하고, `business_status`에 `registration_pending`을 추가한다. 정상 사업자 상태를 거짓으로 표시하지 않는다.
3. `complete_public_store_owner_profile_v1`은 번호 없이도 저장하고, 별도 `activate_preopening_store_owner_v1`이 회사·카카오 인증·약관·매장명·주소·상세주소·연락처를 확인한 뒤 `registration_pending`으로 개통한다. 기존 사업자번호 검증 함수는 유지한다. `normalized_customers.normalized_key`는 매장 계정 UUID 기반의 고유 키를 쓴다.
4. 매장 회원 조회와 주문 RPC는 `registration_pending`도 허용하되 회사·매장·사용자·역할 검사는 유지한다. 사업자번호가 필요한 세금 문서 발행은 등록·검증 전까지 허용하지 않는다. 원가 관리·구성원 내보내기는 이번 SQL 범위 밖이다.
5. 추후 사업자번호 등록은 점주 또는 고객사 관리자가 입력하고 국세청 정상 확인을 거쳐 `active`로 전환한다. 같은 번호가 이미 해당 회사의 다른 매장에 연결돼 있으면 병합하지 않고 확인 필요로 둔다.

## 적용 전 검증

- 운영 제약명·함수 정의와 기존 `business_status` 분포를 읽기 전용으로 확인한다.
- PG17: 번호 없는 점주 가입→같은 매장 재로그인→공유 문서 첫 주문, 번호 있는 기존 가입 회귀, 회사 격리, 중복 Kakao 회원, 사업자번호 나중 등록, 회사 삭제를 검증한다.
- 실행 초안: `docs/sql-drafts/20261110-store-preopening.sql`. 신규 개업 준비 행이 없을 때만 원래 제약으로 되돌릴 수 있으며, 행이 생긴 뒤에는 해당 매장의 사업자 확인을 먼저 마쳐야 한다. 운영 프로젝트 `fcmdvveqmcgtioelzqun` 명시 승인을 받은 뒤에만 적용한다. 적용 전까지 번호 없는 매장 가입 기능은 OFF다.
