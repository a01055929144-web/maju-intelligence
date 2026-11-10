# 배송일 미정 주문 접수 — 2026-11-10 승인 전 초안

대표 결정: 공개 문서→카카오 가입→첫 주문에서 배송 권역·요일·회사 주문 설정을 필수 선행 작업으로 요구하지 않는다. 설정이 갖춰진 매장은 기존 정책을 우선 사용한다. 설정이 없으면 배송일을 임의 확정하지 않고 **주문 접수 후 배송일 확인**으로 접수한다.

## 범위·책임

Owner Domain order, related pricing/organization. 주문 domain의 분류/금액 검증 → 기존 storefront 읽기·주문 API → 매장 화면만 수정한다. 07 개통 API·카카오 인증, 03 거래처 매칭, 중앙 체크리스트는 수정하지 않는다. 회원과 거래처 연결은 기존 결과를 신뢰하며 `needs_review` 등으로 주문이 허용되지 않은 링크는 계속 거부한다. 테스트 합성 데이터만 사용하며 실제 가입·주문을 생성하지 않는다.

## 최소 정책

- 회사 주문 설정과 거래처 우선/권역 차선 배송 요일이 모두 있으면 기존 scheduled 경로와 원본 `place_store_order`/`place_store_member_order`를 그대로 사용한다. 마감·휴일·최소금액·배송비는 유지한다.
- 회사 설정 또는 유효 배송 요일이 없을 때만 opt-in 미정 접수 경로를 사용한다. 배송일은 NULL, `delivery_confirmation=pending`, 상태는 submitted로 기록한다. 임시 날짜·임시 권역·가짜 배송 요일·회사 설정을 만들지 않는다.
- 최소금액/배송비/처리 정책은 거래처→권역→회사 순으로 기존 값을 적용한다. 값 자체가 없으면 최소금액 0, 배송비 0, notice. 확정일이 없으므로 날짜 기반 마감·휴일을 배송 약속으로 적용하지 않는다. 현재 KST 접수일에 유효한 계약가와 발행 가격을 검증한다. 시세/행사/수량/금액/문서 만료·토큰·회원·회사·중복 요청 검증은 유지한다.
- 미정 주문은 새 주문만 받는다. 기존 주문 수정·자동 배차·배송 완료·결제·ERP 연결은 추가하지 않는다. 배송일 확인은 담당자와의 후속 절차이며 이 PR은 날짜 확정용 관리 UI를 추가하지 않는다. pending 상태에서 in_delivery/delivered로의 전환은 DB 제약이 거부한다.
- 화면 날짜 입력을 숨기고 접수 안내·주문 후 상태·이력에 미정 상태를 표시한다. 내부 가격 적용일을 배송 예정일로 표시하지 않는다. 응답 유실 재시도는 동일한 멱등키를 유지한다.

## SQL 적용 대기

up `docs/sql-drafts/20261110-09-pending-delivery-order.sql`, down 동일 이름 `.down.sql`.

1. `store_orders.delivery_confirmation` 열(scheduled/pending, 기본 scheduled) 추가.
2. `delivery_date` NOT NULL 해제, pending일 때만 NULL을 허용하는 짝 제약 추가. 기존 행은 scheduled로 유지한다.
3. 별도 invoker RPC `place_store_pending_delivery_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)` 추가. p_delivery_date는 NULL, 수정 order_id도 NULL만 허용한다. EXECUTE는 service_role만. 기존 함수 정의·OID·ACL은 바꾸지 않는다. 기존 검토된 회원 주문 알고리즘의 가격/재고/금액/회원 잠금 부분을 재사용한 별도 구현이다.

선행은 P0/P1/P2/S2·회원 주문·현재 운영의 개업 준비 매장 스키마다. 새 표·RLS 정책·표 권한 추가는 없다. lock_timeout 3초, statement_timeout 10초. ALTER TABLE 잠금이 필요하므로 실제 행 수와 잠금 여유를 운영 적용 전 확인한다. NULL 배송일을 읽는 지도/배송/ERP 소비자는 적용 검토에서 다시 확인해야 하며, 이 PR에서 해당 도메인 파일은 변경하지 않는다. 새 경로와 배송 snapshot 생산자를 동시에 켜면 API가 미정 주문을 거부한다.

down은 pending/NULL 배송일 주문이 있으면 중단한다. 이력이 없을 때만 신규 함수·열·제약을 제거하고 NOT NULL을 복원한다. 주문을 지우거나 가짜 배송일로 되돌리지 않는다.

## 활성화·검증

기본 OFF `STORE_ORDER_PENDING_DELIVERY_ENABLED=true` + `STORE_ORDER_PENDING_DELIVERY_COMPANY_IDS` 회사 허용목록 + 기존 STORE_ORDERING·회원 주문 허용이 모두 필요하다. OFF에서는 기존 응답/주문 함수를 유지한다. SQL 미적용 상태에서 켜지 않는다. 운영 SQL 실행·플래그 ON·배포는 별도 승인 대기다.

CI: 원본 native 함수 정의/ACL 보존, 설정 있음 우회 거부, 설정 없음 미정 접수·같은 키 재시도·위조 actor/회사 경계·주문 차단 링크·최소금액·rollback, PC/390px 접수/오류/재시도/이력 및 기존 scheduled 회귀를 검증한다. 로컬 설치/개발 서버 대신 CI를 사용한다. Superpowers/Security Audit 전용 도구 미설치이며 직접 권한 검토와 PG17로 검증한다.
