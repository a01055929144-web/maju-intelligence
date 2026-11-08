# 09 주문 배송지·완료 생산자 DB 승인표

Ponytail: 사용함

상태: **검토용 Draft / 운영 미적용 / 런타임 미연결 / Stage D OFF**. 이 문서는 운영 실행 승인이 아니다.

| 항목 | 제안 및 승인 경계 |
| --- | --- |
| 소유 범위 | 09 주문 생산자. 02 TMS/기사, 03 RPC, 07 인증, 04 구매 파일 변경 없음 |
| 선행 조건 | 02 [배송지 승인표](store-order-delivery-snapshot-02.md)의 5개 text 칸·불변 trigger, 기존 7/10인자 주문 함수, 기존 customer_notes/customer_attachments 및 N1 메모 UNIQUE(company_id,customer_id,id) 필요. 누락 시 up 전체 실패 |
| up/down | docs/sql-drafts/20261108-09-order-delivery-producer.sql 및 .down.sql. migration에 등록하지 않음 |
| 추가 객체 | 새 wrapper·완료 함수 각 1개, 배송지 멱등 요청·완료 이벤트·완료↔주문·완료↔첨부 테이블 각 1개. 첨부 소유 범위 복합 UNIQUE 인덱스 1개 |
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

`complete_store_order_delivery_09(uuid,uuid,date,uuid[],jsonb,timestamptz,text,uuid,uuid,uuid[])` 입력 순서:

1. 회사 ID
2. 명시적 completionEventId
3. 배송 예정일
4. 중복 없는 정확한 orderIds 1~100개
5. 각 주문 ID를 키로 하는 expectedRevisions 정수 map
6. 명시적 completedAt
7. 서버가 검증한 actorKey
8. 서버에서 주문/정류장과 대조한 customerId
9. 기존 배송 메모 noteId (필수 UUID)
10. 기존 배송 증빙 attachmentIds (필수 1~100개, 중복/null 금지)

결과는 `{companyId,customerId,deliveryDate,completionEventId,completedAt,orderIds,orderRevisions,noteId,attachmentIds}`다. orderIds/attachmentIds는 정렬되고 orderRevisions는 완료 뒤 revision이다. 같은 이벤트·같은 입력은 동일 결과, 같은 이벤트의 다른 입력(증빙 포함)은 store_order_completion_idempotency_conflict다. 이벤트·주문 관계·증빙 참조와 모든 주문의 delivered/revision+1 전환을 한 트랜잭션으로 확정한다.

## 02에 전달할 증빙 RPC 인자

기존 7개 완료 인자 뒤에 `p_customer_id: uuid`, `p_note_id: uuid`, `p_attachment_ids: uuid[]`를 **필수**로 추가했다. 이는 아직 미적용 Draft의 서명 수정이며, 증빙 없는 이전 7인자 완료 overload를 제공하지 않는다. 기존 7/10인자 **주문** 함수는 그대로다. #414는 새 인자와 결과를 연결하기 전 호출을 차단해야 한다.

SQL은 메모가 같은 회사/거래처의 note_type=delivery인지, 모든 첨부가 같은 회사/거래처의 attachment_type=delivery_proof인지 FOR SHARE로 재검증한다. 주문도 p_customer_id와 일치해야 한다. service_role의 기존 증빙 읽기/행 잠금 권한이 선행되어야 하며 up에서 기존 증빙 테이블 권한을 확대하지 않는다.

메모 ID는 완료 이벤트의 note_id/customer_id에, 첨부 ID는 store_order_delivery_completion_attachments_09에 저장한다. 회사·거래처 복합 FK와 PK로 영속 연결한다. 내용·파일 URL·전화/주소 사본은 저장하지 않는다. 메모 내용 자체의 버전 고정/파일 바이트 불변성을 제공하는 계약은 아니며, 이 초안은 기존 증빙 행에 대한 참조를 보존한다.

새 첨부 복합 인덱스 customer_attachments_delivery_09_scope_uq는 FK용이다. 메모의 기존 N1 복합 UNIQUE를 재사용한다. 인덱스 생성의 테이블 잠금과 증빙 보존/삭제 정책을 운영 승인에 포함한다. 참조된 증빙의 개별 삭제·회사/거래처 재배치는 지연 FK로 거부하며 회사 삭제는 기존 cascade 뒤 검사한다.

첫 호출의 증빙/주문/이벤트/관계 저장 실패는 모두 롤백한다. 배열 순서만 다른 같은 증빙 집합은 동일 재시도다. noteId·첨부 집합·customerId를 바꾸거나 현재 post revision으로 입력을 갱신하면 충돌이다. API는 매번 기사/코스/정류장/증빙 접근 권한을 재검증하고, 기존 이벤트 재시도를 delivered/pre 검사에서 차단하지 말아야 한다. SQL의 캐시 반환은 기존 영속 참조를 유지하며 메모 내용을 재작성하지 않는다.

**completionEventId가 유일한 완료 멱등 키**다. 서버 생성/검증 UUID이며 별도 idempotencyKey는 이 SQL에서 받지 않는다. #405 adapter는 별도 키를 독립적으로 재사용하지 못하도록 이 계약에 맞춰야 한다.

완료 관계는 JSON만 검색하지 않는다. `store_order_delivery_completion_orders_09`에 company_id/completion_event_id/order_id/pre_revision/completed_revision을 저장한다. 회사+이벤트와 회사+주문 복합 FK, 주문당 완료 1개 UNIQUE, completed_revision=pre_revision+1 CHECK를 둔다. 완료 시각은 부모 이벤트의 고정 completed_at 칸에 저장해 FK join으로 조회한다. 관계·이벤트·주문 상태는 같은 트랜잭션이며 실패하면 모두 롤백한다. 관계의 회사 FK는 ON DELETE CASCADE, 주문/이벤트 복합 FK는 NO ACTION DEFERRABLE INITIALLY DEFERRED다. 따라서 관계를 남기는 개별 주문/이벤트 삭제는 트랜잭션 종료 때 거부하고, 회사 삭제는 기존 부모/자식 cascade를 마친 뒤 검사한다. 이는 회사 이용 종료 경로와의 호환성이지 이 PR의 운영 삭제 승인이 아니다.

Stage E는 **delivered 단일 상태**만 소비한다. submitted/received/in_delivery는 완료 함수의 입력 후보일 뿐 전표 생성 조건이 아니다. 후속 E 호출은 회사+주문+완료 이벤트+completed_revision의 영속 관계와 현재 delivered/revision을 잠그고 검증해야 한다. 매출전표 중복은 주문 ID source key(`store_order:<order_id>`)로 막는다. 이번 PR에 전표 호출은 없다. 반품은 별도 return_event_id/idempotency_key·원 매출전표·주문·반품 줄/수량 계약이며, 완료 정정/무효화가 필요하면 별도 void event 계약을 승인해야 한다. 이 Draft에 반품/무효화 구현을 추가하지 않는다.

**02/03 검토가 필요한 제안**: 기존 후보 계약에 맞춰 submitted/received/in_delivery를 완료 가능한 상태로 두었다. 실제 완료 호출자는 검증한 기사·코스·회사·배송일·정확한 주문 묶음과 revision을 먼저 확정해야 한다. SQL의 service_role 권한 자체는 기사/코스 인증을 대신하지 않는다. 배송 예정일은 주문과 일치해야 하지만 completedAt의 달력 날짜와 같도록 강제하지 않는다. 제출 전 시각·5분 초과 미래·취소/기완료·회사/날짜/revision 불일치·snapshot 누락은 거부한다. 이 상태 전이와 지연 완료 시각 정책이 합의되기 전에는 연결하지 않는다.

같은 회사라도 서로 다른 customer_id 주문을 한 이벤트에 섞으면 store_order_completion_customer_mismatch로 전부 거부한다. 같은 거래처라는 사실만으로 동일 정류장임을 증명하지는 않는다.

## API 연결 전 필수 미완료 항목

아래 항목은 이번 SQL 초안이 완료하지 않았으며, 연결 전에 02/03과 계약·원자성 검증을 마쳐야 한다.

- 인증 기사·확정 코스·차량·정류장과 정확한 주문 묶음 검증. actor_key는 클라이언트 입력을 받지 않고 서버 세션에서 산출.
- #414가 새 증빙 인자/결과와 영속 관계를 소비하도록 연결하고 API→실제 격리 PG17에서 검증. SQL Draft의 증빙 원자 저장과 API 연결 완료를 구분.
- #405의 별도 idempotencyKey를 위 단일 완료 이벤트 키 계약으로 변환/검증하는 adapter와 UUID 형식 검사. 동일 재시도에서도 기사/코스 인증을 먼저 다시 검증.
- #405 DTO의 pre/post revision 매핑. 현재 입력은 expectedRevisions, 결과는 완료 뒤 orderRevisions이며 DTO 연결은 미구현.
- 명시적 완료 이력 projection과 재조회 계약. 현재 SQL의 이벤트 기록을 화면 이력/API로 연결하지 않음.

대표 오류: store_order_completion_invalid / unavailable / revision_conflict / snapshot_required / customer_mismatch / proof_invalid / proof_unavailable. 방문 메모·상태 추정·주소 문자열로 완료를 만들지 않는다. TMS 배정·ERP·재고·원장 호출은 추가하지 않았다.

## 검증과 되돌리기

CI의 정확한 폐기 DB `store_member_order_test_delivery_09` 및 127.0.0.1만 허용한다. 실제 PG17에서 기존 회원 회귀, 원본 함수 OID/본문/ACL, snapshot 원자성·불변·회사 경계·제거 회원·동시 동일/충돌 재시도, 완료 실패 원자성·중복/동시 이벤트·revision·취소/회사/날짜/거래처 경계, 영속 관계 FK/UNIQUE/revision/시각·개별 삭제 차단·회사 cascade, up/down/up을 확인한다. 회사 삭제 테스트는 완료 기록이 있는 합성 회사에 DELETE 후 SET CONSTRAINTS ALL IMMEDIATE로 지연 제약까지 검사하고 다른 회사를 보존한 뒤, fixture 재사용을 위해 롤백한다. 실행 결과는 PR의 CI 링크에 기록한다. 운영 DB로 이 fixture를 실행하면 안 된다.

down은 호출자를 먼저 중지하고 새 네 테이블이 **비어 있을 때만** 새 객체와 새 첨부 복합 인덱스를 제거한다. 데이터가 있으면 store_order_delivery_09_down_refused_data_exists로 거부한다. 기존 주문·02 snapshot 칸/trigger·기존 함수·기존 메모/첨부 행·N1 메모 복합 UNIQUE는 유지한다. 기록이 생긴 운영 환경은 데이터를 보존하고 별도 보존/정리 승인으로 처리하며 테스트의 TRUNCATE 절차를 따라 하면 안 된다.
