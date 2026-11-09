# store_orders 배송지 snapshot 승인 초안

상태: **미승인·미적용**. 이 문서는 SQL 설계 검토용이며 migration이나 운영 DB 변경을 포함하지 않는다.

- SQL 초안: [`20261108-stage-d-delivery-snapshot-02.sql`](../../sql-drafts/20261108-stage-d-delivery-snapshot-02.sql)
- Down 초안: [`20261108-stage-d-delivery-snapshot-02.down.sql`](../../sql-drafts/20261108-stage-d-delivery-snapshot-02.down.sql)
- PG17 검증: [`20261108-stage-d-delivery-snapshot-02.pg17.test.sql`](../../sql-drafts/20261108-stage-d-delivery-snapshot-02.pg17.test.sql)
- 09 입력 인계: [`2026-11-08-02-stage-d-09-snapshot-input-handoff.md`](../2026-11-08-02-stage-d-09-snapshot-input-handoff.md)

현재 `store_orders`에는 아래 snapshot 컬럼이 하나도 없다. 따라서 승인된 컬럼 추가와 주문 생성 시 기록, 기존 주문의 확인·backfill이 끝나기 전까지 실제 `store_orders`에서 만들어지는 배차 후보는 **0건**이다. 활성 주문은 사라지지 않고 `missing_delivery_snapshot` 차단 목록에 남아 미배정·주소 확인 화면에서 사용할 수 있다.

## 필요한 컬럼

| 컬럼 | 형식 | 주문 생성 시 값 | 필수 여부 |
| --- | --- | --- | --- |
| `delivery_customer_name_snapshot` | `text` | 거래처명 | 필수 |
| `delivery_address_snapshot` | `text` | 기본 주소 | 필수 |
| `delivery_address_detail_snapshot` | `text` | 상세 주소 | 선택 |
| `delivery_recipient_phone_snapshot` | `text` | 배송 연락처 | 선택 |
| `delivery_loading_position_snapshot` | `text` | 적재 위치 | 선택 |

## 승인 조건

| 항목 | 상태 |
| --- | --- |
| 09 주문 생성 RPC가 snapshot을 같은 transaction에서 기록 | 09 인수·승인 필요 |
| 기존 주문 기본 처리 | **확정:** 자동 backfill 금지, `missing_delivery_snapshot`으로 차단 유지 |
| 기존 주문을 확인 후 살릴 범위 | **미결정:** 대상 기간·상태·고객 공지 기준을 운영 책임자가 승인해야 함 |
| 주소 확인 담당 | **미결정:** 회사 관리자/배차 담당자 제안, 최종 역할과 대리 권한 승인 필요 |
| 확인 기록 | **미결정:** 확인자·확인 시각·근거·정정 사유의 저장 위치를 09가 제안해야 함 |
| snapshot 없는 기존 주문은 자동 배차 금지 | 확정 |
| 거래처 마스터 변경 시 기존 주문 snapshot 불변 | 확정 |
| 운영 SQL 적용·자동 배차·플래그 ON | 이번 PR 제외 |

승인 전 02 adapter는 거래처 현재 주소를 대신 사용하지 않으며 필수 snapshot이 없는 주문을 배차 후보에서 제외한다.

## 운영 승인 패킷: 02 snapshot/guard 범위

이 절은 02 소유 SQL만 다룬다. #410의 완료 테이블·RPC·RLS·권한은 09 승인 패킷에서 별도로 승인한다. 02 선행 SQL이 통과되어도 09 SQL 적용, API 쓰기, 기능 ON을 자동 승인하지 않는다.

### 1. 실행 전 읽기 점검

| 점검 | 기록할 값 | 중단 기준 |
| --- | --- | --- |
| DB 정체성 | project/ref, database name, PostgreSQL major, read replica 여부 | 대상이 운영 승인서와 다름 |
| `store_orders` 정의 | 테이블 OID, owner, RLS, 상위 FK, 기존 trigger/index/constraint 정의 hash | 폐기형 PG17 전제와 추가 차이 존재 |
| 컬럼 충돌 | snapshot 5개 컬럼의 존재·형식·nullability | 동일 이름의 다른 형식/의미가 존재 |
| 객체 충돌 | check, guard function, trigger, candidate index의 동일 이름 존재 여부와 정의 | 동일 이름이지만 정의가 다름 |
| 행 현황 | 전체 건수, 회사·상태·배송일별 건수, 활성 주문 수 | 예상과 다른 급격한 증감 |
| 장시간 transaction | `store_orders` 장기 실행 transaction·lock wait·DDL 대기 여부 | 잠금 시간 예상 불가 |
| 기존 쓰기 경로 | 7/10인자 주문 RPC 호출량, 주문 수정 job, 직접 SQL 쓰기 | 변경 창 동안 유입 차단 불가 |

조회 결과와 시각은 승인 기록에 남기되, 거래처명·주소·연락처 원문을 승인 문서에 복사하지 않는다.

### 2. 백업·복구 범위

- 시점 복구가 가능한 백업/PITR 시각과 예상 복구 시간을 기록한다.
- `public.store_orders` 전체 행과 schema, 기존 constraint·trigger·index·ACL/RLS 정의를 복구 범위에 포함한다.
- 회사·상태·배송일별 기준 건수를 백업 검증값으로 남긴다.
- 복구 담당자, DB 적용 담당자, 서비스 중단 판단자를 분리해 기록한다.
- down SQL은 백업이 아니다. snapshot 값이 한 건이라도 생긴 후 컬럼을 내리면 데이터가 소실되므로, 복구 승인 없이 down을 실행하지 않는다.

### 3. 적용·즉시 검증 순서

1. 주문 쓰기 유입을 멈추고 적용 시작 시각과 기준 건수를 기록한다.
2. 고정 SHA의 `20261108-stage-d-delivery-snapshot-02.sql`만 하나의 transaction으로 실행한다.
3. snapshot 5개 컬럼이 모두 `text`, nullable인지 확인한다.
4. `store_orders_delivery_snapshot_complete_check`가 존재하고 전체 `null` 또는 필수 2개 완성 조합만 허용하는지 확인한다.
5. `guard_store_order_delivery_snapshot_02()`가 security invoker이고 public EXECUTE가 revoke되었는지 확인한다.
6. `store_orders_delivery_snapshot_immutable_02` trigger가 활성이고 snapshot 컬럼 수정에만 발동하는지 확인한다.
7. `store_orders_delivery_snapshot_candidates_02_idx`가 회사·배송일·거래처·주문 순서이며 활성 상태와 필수 snapshot을 조건으로 가지는지 확인한다.
8. 적용 전/후 전체·회사·상태별 주문 건수가 같고, snapshot 비null 행이 0건인지 확인한다.
9. 부분 snapshot 쓰기는 check에 의해 거부되고, 완성 snapshot을 설정한 폐기형 검증 행은 이후 수정이 거부되는지 확인한다. 이 검사는 운영 거래처 행에서 수행하지 않는다.
10. 유입을 재개하고 기존 7/10인자 RPC, 주문 수정, 취소 경로의 5xx·lock wait·latency를 관찰한다.

다음 중 하나라도 다르면 09 SQL과 #414 배포를 진행하지 않는다: 주문 건수 변경, 기존 행의 snapshot 자동 채움, 부분 snapshot 허용, guard 미발동, 기존 RPC 오류, 예상보다 긴 DDL lock.

### 4. OFF 배포 경계

02 SQL 통과 후에도 아래 순서를 유지한다.

1. 09의 별도 승인 패킷에서 #410 객체·RLS·ACL·down·PG17 결과를 승인한다.
2. 09 SQL이 02 snapshot/guard 후에만 적용되었는지 확인한다.
3. #414 애플리케이션을 `STAGE_D_ORDER_COMPLETION` 기본 OFF, 회사 allowlist 빈 값으로 배포한다.
4. OFF 상태에서 완료 endpoint가 404이고, 주문·코스·사진·메시지 기존 흐름이 변하지 않았는지 확인한다.
5. 최소 관찰 창의 5xx, DB lock, 주문 생성/수정 실패, PC/390px 회귀가 모두 정상이기 전에는 1건 시험을 승인하지 않는다.

### 5. 02 되돌리기 조건

- snapshot 5개 컬럼이 모두 전체 `null`이고 09 객체·완료 event가 0건임을 확인한 경우에만, 09 down 후 02 down 역순을 검토한다.
- snapshot 값이 한 건이라도 있거나 완료 event가 있으면 down으로 컬럼을 삭제하지 않는다. 기능 OFF, 애플리케이션 복귀, DB forward-fix를 사용한다.
- 회사 경계, 주문 건수, snapshot 불변성이 훼손된 경우 자동 재시도·자동 backfill·수동 삭제를 금지하고 사고 범위를 보존한다.

## SQL 초안 동작

- 기존 주문은 snapshot이 모두 `null`인 상태로 보존하고 `missing_delivery_snapshot` 차단 대상으로 남긴다.
- 거래처명과 기본 주소는 둘 다 있어야 하며 부분 snapshot은 저장하지 않는다.
- 완성된 snapshot은 거래처 마스터가 바뀌어도 수정할 수 없다.
- 후보 조회 인덱스는 회사·배송일을 먼저 구분하고 `submitted`, `received`, `in_delivery`만 포함한다. `cancelled`, `delivered`는 제외한다.
- 운영 적용 전 기존 주문의 주소 확인·backfill 담당자와 감사 기록 방식을 별도 승인한다.
- 회사 삭제 시 기존 `store_orders`의 회사 FK `on delete cascade`를 따라 snapshot도 함께 삭제되며 다른 회사 주문은 유지한다.
- Down은 snapshot 칸·제약·불변 trigger·부분 인덱스만 제거하고 기존 주문 행은 삭제하지 않는다.
- 자동 스키마 목록은 기존 테이블 상태와 분리해 다섯 칸을 `초안 추가:`로 표시한다.

## 09 입력 계약

09 주문 생성 RPC는 새 주문을 저장하는 같은 transaction에서 아래 값을 `store_orders`에 기록해야 한다. 02는 09 RPC나 화면을 수정하지 않는다.

| 입력 | 원천 | 규칙 |
| --- | --- | --- |
| `deliveryCustomerNameSnapshot` | 주문 확인 시 거래처명 | 공백 불가 |
| `deliveryAddressSnapshot` | 주문 확인 시 기본 주소 | 공백 불가 |
| `deliveryAddressDetailSnapshot` | 주문자가 확인한 상세 주소 | 선택 |
| `deliveryRecipientPhoneSnapshot` | 주문자가 확인한 배송 연락처 | 선택 |
| `deliveryLoadingPositionSnapshot` | 주문자가 확인한 적재 위치 | 선택 |

- 주문 생성 후 거래처 마스터 변경값으로 snapshot을 덮어쓰지 않는다.
- 기존 주문은 현재 거래처 주소로 자동 backfill하지 않는다. 확인된 주문만 전체 snapshot을 한 번에 기록한다.
- 09는 주문 저장 실패 시 snapshot도 함께 rollback하고, snapshot 저장 실패 시 주문만 남기지 않는다.

## 기존 주문 승인 전 운영 원칙

- 현재 거래처 주소를 과거 주문 주소로 추정하지 않는다.
- 미확인 주문은 배차 후보 0건으로 처리하되 주문 자체는 차단 목록에 보존한다.
- backfill 승인이 나더라도 필수 snapshot 전체를 한 번에 기록하고 확인자·시각·근거를 남긴다.
- 주소 확인 담당과 감사 기록 위치가 정해지기 전에는 기존 주문 backfill UI/RPC를 만들지 않는다.
