# Stage C — 회원 주문 소비 연결과 DB 재검증 초안

Ponytail: 사용함

## 기준과 소유
- #345 head `4be6049`에서 별도 브랜치로 분리하고 main `de463c0`(#348 포함)을 병합했다. #345 브랜치는 수정하지 않았다. #345 선행 변경이 main에 병합되기 전에는 이 PR도 병합하지 않는다.
- 07 #348의 검증 head `21f5a7d856fc910b55dbbd0e9e252a63aa320183`, CI #2291 전체 PASS를 확인했다. 기존 `lib/store/07-store-member-context.ts`의 `getStoreOrderMemberContext({ companyId, customerId })`를 소비하며 07 구현 파일을 수정하지 않는다.
- 새 DB 함수 변경은 09 소유의 별도 review-only up/down 초안이다. 03 기존 SQL/migration·수락 RPC 파일은 수정하지 않는다. 운영 DB 실행·기능 ON·환경변수·실제 메시지·배포는 수행하지 않는다.

## 인증 → 주문 계약
- 공개 링크는 조회/담기 자격이다. 주문 PUT은 토큰에서 해석한 회사·거래처를 07 helper에 전달하고, 활성 회원 컨텍스트가 없으면 RPC 호출 없이 403이다.
- company/customer/storeAccount/member/authUser/가격은 요청 JSON의 신뢰 입력이 아니다. 서버 helper의 계정·회원·로그인 사용자 ID만 RPC로 전달한다. 쿠키를 생성하거나 직원/관리자 세션을 매장 세션으로 승격하지 않는다.
- DB `place_store_order`는 링크를 잠근 뒤 같은 회사·거래처의 활성 매장과 영업 상태, 활성 회원과 owner/manager/staff 역할, 해당 auth_user_id의 활성 app_users를 `FOR SHARE`로 재확인한다. 상태 변경과 충돌하는 잠금이며 회원 상태를 확인하기 전에 멱등 결과를 반환하지 않는다.
- 신규 주문은 store_account_id/ordered_by_member_id를 함께 저장한다. 기존 주문은 백필하지 않는다. 회원 정보 없는 기존 주문의 수정은 거부한다. 같은 매장의 구성원 수정은 기존 작성자를 보존한다.
- 멱등 지문은 회원/매장/로그인 사용자를 포함한다. 같은 회원의 동일 요청은 주문 1건, 다른 회원의 같은 키나 탈퇴 후 같은 키 재생은 거부한다. 기존 token-only 요청의 키를 새 회원 주문으로 재해석하지 않는다.
- 가격·세금·문서/규격/단위 스냅샷·배송 정책·재고·수량 계산은 실제 P2 migration 함수 본문을 보존한다. 추가 필드는 서버 내부 입력이며 공개 응답에 원가/회원 식별자를 추가하지 않는다.

## SQL 승인 경계
- up: `docs/sql-drafts/20261108-09-store-member-order.sql`. 기존 7인자 함수를 10인자로 교체하고 이전 token-only overload를 남기지 않는다. 추가 인자 기본값 null 호출도 회원 없음으로 거부한다. 신규 테이블·컬럼·SECURITY DEFINER는 없다.
- 선행: 실제 P0/P1/P2/S2와 manager-role 스키마, app_users(id,status), 기존 RLS/service_role 접근 계약. 회원/계정/app_users 행 잠금에는 service_role의 기존 SELECT 및 UPDATE 권한이 필요하다. 이 초안은 테이블 권한을 확대하지 않는다.
- down: 회원 귀속 주문이 하나라도 있으면 전체 거부한다. 빈 상태에서만 구 7인자 함수를 복원한다. token-only 경로를 복원하므로 기능 OFF에서만 별도 승인 후 사용한다.
- 명시적인 신규 DB 적용 승인 전 운영 실행 금지. #342 수락→링크 적용/승인이 이 주문 함수 변경의 승인을 대신하지 않는다. 활성화에는 07 인증 배포 + 이 RPC 적용 + 실제 브라우저/API/DB E2E가 필요하다.

## 검증
- API: 공개 토큰만/위조 회원 입력 거부, 서버 scope 사용, DB 재검증 실패 403 및 우회 없음.
- PG17: 실제 P0/P1/P2/S2 migration + 주변 합성 fixture로 회원/회사/매장/사용자/역할 경계, 주문 작성자 기록, 가격 스냅샷, 동일 요청 1건, 빈 down/up, 데이터 존재 down 거부.
- 두 연결: 미커밋 회원 탈퇴의 실제 잠금 대기를 관찰한 뒤 커밋하면 주문 거부, 동시 동일 요청은 주문/줄/요청 각각 1건이다. loopback 전용 폐기 DB만 허용한다.
- 기존 PC/390px 화면 회귀는 API 합성 검증이다. 신규 회원 주문의 실제 전체 E2E 완료로 표시하지 않는다. 최종 실행 결과는 PR 본문에 기록한다.
- Superpowers/Security Audit 미설치. 시각 디자인 변경 없음.
