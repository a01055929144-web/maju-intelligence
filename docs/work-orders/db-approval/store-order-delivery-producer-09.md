# 09 주문 배송지·완료 생산자 DB 승인표

Ponytail: 사용함

상태: **검토용 Draft / 운영 미적용 / 런타임 미연결 / Stage D OFF**. 이 문서는 운영 실행 승인이 아니다.

| 항목 | 제안 및 승인 경계 |
| --- | --- |
| 소유 범위 | 09 주문 생산자. 02 TMS/기사, 03 RPC, 07 인증, 04 구매 파일 변경 없음 |
| 선행 조건 | 02 [배송지 승인표](store-order-delivery-snapshot-02.md)의 5개 text 칸·불변 trigger를 별도 승인·적용한 상태. 기존 7/10인자 함수 존재 필수 |
| up/down | docs/sql-drafts/20261108-09-order-delivery-producer.sql 및 .down.sql. migration에 등록하지 않음 |
| 추가 객체 | 새 wrapper·완료 함수 각 1개, 배송지 멱등 요청·완료 이벤트 테이블 각 1개 |
| 기존 보존 | 7인자 place_store_order와 10인자 place_store_member_order의 OID/본문/ACL 변경 없음. 새 wrapper에서 동일 트랜잭션으로 호출 |
| 권한 | SECURITY INVOKER, RLS, service_role만 함수 실행·새 테이블 SELECT/INSERT. anon/authenticated 접근 금지. UPDATE/DELETE 권한 없음 |
| 개인정보 | 이름·주소·상세주소·전화·하차 위치는 원본 주문 snapshot에만 저장. 새 멱등 기록에는 식별자·fingerprint·생성 시각만 저장하며 배송지 사본 없음. 보존·삭제 정책과 운영 접근자는 적용 전에 별도 확인 |
| 실행 승인 | 운영 프로젝트·대상 회사·선행 DDL·검증 결과를 확인한 별도 명시 승인 필요. API 전환·기능 ON·배포 승인과 분리 |

## 주문 입력과 결과

`place_store_order_with_delivery_snapshot_09(text,date,jsonb,uuid,jsonb,uuid,integer,text,uuid,uuid,uuid)`는 기존 입력에 snapshot JSON만 추가한다. 마지막 account/member/auth 3개는 전부 null이면 기존 7인자 경로, 전부 있으면 회원 10인자 경로다. 향후 서버가 검증한 회원 문맥으로 결정해야 하며 클라이언트 식별자를 신뢰해서는 안 된다.

snapshot은 다음 5개 camelCase 칸만 허용한다.

| 입력 | 규칙 |
| --- | --- |
| deliveryCustomerNameSnapshot | 필수, trim 후 1~200자 |
| deliveryAddressSnapshot | 필수, trim 후 1~500자 |
| deliveryAddressDetailSnapshot | 선택, 500자 이하, 빈 값 null |
| deliveryRecipientPhoneSnapshot | 선택, 40자 이하, 빈 값 null |
| deliveryLoadingPositionSnapshot | 선택, 500자 이하, 빈 값 null |

신규 주문의 이름·기본 주소는 링크의 회사/거래처 등록값과 일치해야 한다. 다른 배송지 선택은 이번 계약에 없다. 회원 권한·가격·주문 revision·작성자는 기존 함수가 검증/생성한다. 결과도 기존 `{id,revision,knownTotal,marketPricePending}` 그대로다.

정규화한 5개 값과 주문 입력·회원 문맥·expectedRevision을 fingerprint에 묶고, 재시도는 연결된 원본 주문 snapshot과도 비교한다. 같은 키의 다른 입력은 delivery_snapshot_idempotency_conflict다. 기존 함수만 사용한 키는 delivery_snapshot_existing_request로 거부하고 과거 주문을 보완하지 않는다. 기존 주문 편집은 5개 snapshot이 전부 동일할 때만 허용하며 누락은 delivery_snapshot_required, 변경은 delivery_snapshot_immutable로 거부한다. 최초 생성·snapshot·기존/신규 멱등 기록은 한 트랜잭션이며 어느 단계든 실패하면 모두 롤백한다.

## 02에 전달할 완료 입력과 결과

`complete_store_order_delivery_09(uuid,uuid,date,uuid[],jsonb,timestamptz,text)` 입력 순서:

1. 회사 ID
2. 명시적 completionEventId
3. 배송 예정일
4. 중복 없는 정확한 orderIds 1~100개
5. 각 주문 ID를 키로 하는 expectedRevisions 정수 map
6. 명시적 completedAt
7. 서버가 검증한 actorKey

결과는 `{companyId,deliveryDate,completionEventId,completedAt,orderIds,orderRevisions}`다. orderIds는 정렬되고 orderRevisions는 완료 뒤 revision이다. 같은 이벤트·같은 입력은 동일 결과, 같은 이벤트의 다른 입력은 store_order_completion_idempotency_conflict다. 이벤트 기록과 모든 주문의 delivered/revision+1 전환을 한 트랜잭션으로 확정한다.

**02/03 검토가 필요한 제안**: 기존 후보 계약에 맞춰 submitted/received/in_delivery를 완료 가능한 상태로 두었다. 실제 완료 호출자는 검증한 기사·코스·회사·배송일·정확한 주문 묶음과 revision을 먼저 확정해야 한다. SQL의 service_role 권한 자체는 기사/코스 인증을 대신하지 않는다. 배송 예정일은 주문과 일치해야 하지만 completedAt의 달력 날짜와 같도록 강제하지 않는다. 제출 전 시각·5분 초과 미래·취소/기완료·회사/날짜/revision 불일치·snapshot 누락은 거부한다. 이 상태 전이와 지연 완료 시각 정책이 합의되기 전에는 연결하지 않는다.

같은 회사라도 서로 다른 customer_id 주문을 한 이벤트에 섞으면 store_order_completion_customer_mismatch로 전부 거부한다. 같은 거래처라는 사실만으로 동일 정류장임을 증명하지는 않는다.

## API 연결 전 필수 미완료 항목

아래 항목은 이번 SQL 초안이 완료하지 않았으며, 연결 전에 02/03과 계약·원자성 검증을 마쳐야 한다.

- 인증 기사·확정 코스·차량·정류장과 정확한 주문 묶음 검증. actor_key는 클라이언트 입력을 받지 않고 서버 세션에서 산출.
- noteId·attachmentIds의 회사·거래처 검증 및 완료 이벤트와 같은 트랜잭션 연결. 메모/첨부가 따로 성공한 것을 완료 성공으로 취급하지 않음.
- completionEventId와 별도 idempotencyKey의 관계 확정. 현재 SQL은 completionEventId 자체를 이벤트 멱등 키로 사용하며 별도 키를 받지 않음.
- #405 DTO의 pre/post revision 매핑. 현재 입력은 expectedRevisions, 결과는 완료 뒤 orderRevisions이며 DTO 연결은 미구현.
- 명시적 완료 이력 projection과 재조회 계약. 현재 SQL의 이벤트 기록을 화면 이력/API로 연결하지 않음.

대표 오류: store_order_completion_invalid / unavailable / revision_conflict / snapshot_required / customer_mismatch. 방문 메모·상태 추정·주소 문자열로 완료를 만들지 않는다. TMS 배정·ERP·재고·원장 호출은 추가하지 않았다.

## 검증과 되돌리기

CI의 정확한 폐기 DB `store_member_order_test_delivery_09` 및 127.0.0.1만 허용한다. 실제 PG17에서 기존 회원 회귀, 원본 함수 OID/본문/ACL, snapshot 원자성·불변·회사 경계·제거 회원·동시 동일/충돌 재시도, 완료 실패 원자성·중복/동시 이벤트·revision·취소/회사/날짜 경계, up/down/up을 확인한다. 실행 결과는 PR의 CI 링크에 기록한다. 운영 DB로 이 fixture를 실행하면 안 된다.

down은 호출자를 먼저 중지하고 새 두 테이블이 **비어 있을 때만** 새 객체를 제거한다. 데이터가 있으면 store_order_delivery_09_down_refused_data_exists로 거부한다. 기존 주문·02 snapshot 칸/trigger·기존 함수는 유지한다. 기록이 생긴 운영 환경은 데이터를 보존하고 별도 보존/정리 승인으로 처리하며 테스트의 TRUNCATE 절차를 따라 하면 안 된다.
