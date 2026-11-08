# 03 Stage E 첫 주문 → 매출전표 → 거래처원장 승인 초안

> 상태: **읽기 검토 완료 · #384 SQL Draft 검증 완료 · 승인 전 · 운영 적용/기능 ON 금지**
> 소유: 03 전표·원장. 09의 링크/주문 화면·API와 01의 TMS 파일은 수정하지 않는다. 중앙 `db-approval-queue.md`는 컨트롤타워만 수정한다.  
> Ponytail: 사용함 — 새 테이블·새 원장·새 금액 공식을 만들지 않고 운영 적용된 ERP 전표와 원장을 재사용한다.

## 결론

현재 `store_orders`에서 `business_documents`로 이어지는 원자 경로는 없다. 다만 필요한 정본은 이미 있다.

- 주문: `store_orders`와 `store_order_lines`의 회사·거래처·가격·과세·수량 스냅샷
- 매출전표: `business_documents`와 `business_document_lines`
- 거래처원장: append-only `partner_ledger_entries`
- 전표 확정·원장 기록: 기존 `confirm_business_document`
- 중복 방지: `business_documents(company_id, source_type, source_key)` 부분 UNIQUE

따라서 Stage E 첫 경로는 **배송 단계가 제공하는 출고 가능 상태를 잠근 뒤 주문 스냅샷으로 매출전표를 한 번 만들고 기존 확정 함수를 호출하는 service-role RPC 1개**가 최소 범위다. 새 화면, 새 전표/원장 테이블, 원장 잔액 컬럼, 주문 금액 재계산은 필요 없다.

## 선행 차단

#397로 Stage D의 주문 ID·부분 완료 소비자 계약은 병합됐다. 09 #410 Draft는 `delivered` 전환과 주문별 `(company_id, completion_event_id, order_id, completed_revision)` 관계를 제안하고 검증했지만 아직 DB 승인·병합·운영 적용 전이다. #384는 이 인터페이스를 03 폐기형 PG17 fixture로만 소비하며, 주문과 완료 관계를 함께 잠그고 현재 revision이 completed_revision과 일치할 때만 매출전표를 만든다. #410 생산자 계약이 승인·병합되고 운영 적용 순서가 정해지기 전에는 #384 Ready 전환·병합·운영 적용·호출 코드 연결을 하지 않는다. 서버 호출 코드와 회사별 활성화가 없으므로 기능은 OFF다. 오래된 #281은 #384로 대체되어 종료했으며 두 SQL을 함께 적용하지 않는다.

#414 최종 head `eaa0c91`은 #410의 10인자 완료 RPC에 거래처·배송 메모·정렬된 증빙 첨부 ID를 전달하고 같은 증빙 집합을 결과에서 다시 검증한다. `completedAt`은 문자열이 아니라 같은 UTC instant로 비교하며, `delivered` 재시도는 같은 completion event의 영속 주문 관계와 pre/completed revision을 확인한 뒤 원 입력을 RPC에 다시 전달한다. 이 변경은 #384가 소비하는 회사·completion event·주문·completed revision·저장된 completed_at 경계를 바꾸지 않는다. 다만 #410 SQL이 실제 승인·병합·격리 통합 검증·운영 적용되기 전까지 이 대조는 읽기 검토일 뿐이며 Stage E 전표 생성은 Draft/OFF다.

1. 전표 생성이 허용되는 단일 주문 상태 `delivered`와 #410 완료 관계의 DB 승인·적용
2. 취소 주문·미확정 시가 품목·수정 중 주문의 거부 규칙
3. 배송 완료와 출고 확정의 순서 및 재시도 계약
4. 재고 `sale_out` 소유 RPC와 전표 생성의 같은 트랜잭션 여부

04 #404 재검토에서 기존 `apply_inventory_for_document`가 `resolve_status='ok'`인 줄만 집계해, 해석 실패 줄과 성공 줄이 섞인 전표가 부분 `sale_out`으로 확정될 수 있음이 확인됐다. #384는 04 함수를 수정하지 않고, 주문 스냅샷으로 전표 줄을 만든 직후 `inventory_resolve_document_lines` 결과 수가 전표 줄 수와 같고 모든 상태가 `ok`인지 먼저 확인한다. 하나라도 `no_product`, `no_conversion`, `untracked` 또는 기타 실패면 같은 트랜잭션을 예외로 중단해 전표 초안도 남기지 않는다. 이 사전 조건과 확정 호출을 같은 트랜잭션으로 묶는 운영 경로가 승인되기 전에는 Stage E를 켜지 않는다.

### 완료 → 전표 확정 트랜잭션 주체 결정안

선택지는 아래 둘로 제한한다. MAJU는 ERP 선택 사용이므로 **A안을 권장안으로 고정**하며, 승인 전에는 어느 안도 구현하지 않는다.

| 안 | 단일 트랜잭션 주체 | 경계 | 판단 |
| --- | --- | --- | --- |
| A. 03 opt-in 조정 wrapper | 서버가 회사별 Stage E 플래그를 확인한 뒤 03 service-role wrapper 하나를 호출하고, wrapper가 승인된 09 완료 함수를 호출한 다음 같은 PostgreSQL 트랜잭션에서 03 전표 생성·전체 inventory resolve·기존 전표 확정을 실행 | 기본 09 완료 RPC는 그대로 유지한다. 03은 ERP 사용 회사의 선택 경로만 소유하고, 04는 기존 재고 트리거를 계속 소유 | **권장.** 비ERP 회사의 D 경로를 E에 결합하지 않는다. ERP 회사에서는 전표/재고 실패 시 배송 완료까지 전부 롤백한다. |
| B. 09 완료 생산자 조정 | 기본 09 완료 RPC가 completion event·주문 관계 뒤 03 전표 확정을 호출 | 모든 배송 완료 회사가 03 ERP 경로에 의존 | 원자성은 단순하지만 비ERP 회사까지 D와 E가 강하게 결합되므로 채택하지 않는다. 별도 제품 결정으로 ERP가 필수가 될 때만 재검토한다. |

권장 A안에서 Stage E 플래그는 회사별·기본 OFF이며 서버가 신뢰된 회사 ID로 wrapper 진입을 선택한다. 플래그 OFF 회사는 기존 09 D 완료 경로만 사용하고 전표·원장·재고를 만들지 않는다. 플래그 ON 회사의 여러 주문은 안정된 order ID 순서로 처리하며 하나라도 실패하면 전체 완료 묶음을 롤백한다. 공개 API나 클라이언트가 완료 RPC와 전표 RPC를 두 번 나눠 호출하는 방식은 허용하지 않는다. 04 `apply_inventory_for_document`는 수정하지 않고, 03이 모든 줄의 resolve 성공을 확인한 직후 기존 `confirm_business_document`를 호출해 원장과 재고 트리거를 같은 트랜잭션에서 실행한다.

원 배송 완료 멱등키는 `completionEventId`를 유지하고, 주문별 최초 매출전표는 기존 `source_type='order'`, `source_id=order_id`, `source_key='store_order:' || order_id` UNIQUE를 유지한다. wrapper 재시도는 새 전표 source key나 별도 재고 키를 만들지 않고, 09의 같은 완료 결과와 03의 같은 confirmed 전표를 반환해야 한다.

### 실패·타임아웃 재시도 계약

- 전표 생성, 전체 inventory resolve, 전표 확정, 원장 또는 재고 중 하나라도 실패하면 completion event·주문 상태/revision·전표·원장·재고를 모두 롤백한다.
- 실패 후 재시도는 같은 `completionEventId`와 동일한 회사·주문·pre revision·UTC 완료 instant·actor·증빙 집합만 허용한다. 새 이벤트 ID로 실패를 숨기지 않는다.
- 커밋 응답을 받지 못한 타임아웃은 성공 여부를 추측하지 않고 같은 이벤트 ID로 재호출한다. 이미 커밋됐다면 09는 같은 완료 관계를, 03은 주문 source key의 같은 confirmed 전표를 반환하며 원장과 `sale_out`은 각각 한 번이어야 한다.
- 같은 이벤트 ID의 입력이 달라지면 충돌로 종료한다. 자동 보정, 부분 재실행, 기존 전표 삭제 후 재생성은 금지한다.
- 운영 재시도 전에 completion event·전표 status·원장 idempotency key·inventory position을 함께 조회할 진단 절차가 필요하다.

가칭 거래처는 폐기 가능한 PG17 fixture에만 두며 운영 백필이나 운영 주문 생성에 사용하지 않는다.

## 최소 승인 범위

| 항목 | 최소안 | 제외 |
| --- | --- | --- |
| 진입점 | 회사·주문 ID·completion event ID·행위자를 받는 service-role RPC 1개 | 09 주문 API/UI 수정 |
| 잠금 | `(company_id, order_id)` 주문과 #410 완료 관계를 잠그고 `delivered`·completed revision 확인 | TMS 상태 복제 |
| 전표 | 기존 `business_documents`에 `document_type='sale'`, `source_type='order'`, `source_id=order_id`, `source_key='store_order:' || order_id` | 새 매출 테이블 |
| 전표 줄 | `store_order_lines`의 상품명·규격·단위·수량·단가·과세 스냅샷을 그대로 복사 | 현재 상품/가격 재조회·재계산 |
| 원장 | 기존 `confirm_business_document`를 호출해 `document:{id}:confirm` 1건 생성 | 별도 원장 INSERT 경로 |
| 중복 방지 | 기존 source key UNIQUE와 같은 주문 재조회로 원래 전표 반환 | 중복 요청 테이블 |
| 재고 사전 조건 | 생성된 전표 줄 전체의 inventory resolve가 `ok`일 때만 후속 확정 허용 | 성공 줄만 부분 `sale_out` |
| 회사 경계 | 주문·거래처·상품·전표를 모두 입력 회사로 검증 | 공개/클라이언트 직접 실행 |
| 기능 제어 | 회사별 Stage E 플래그 기본 OFF, 승인 회사만 서버에서 호출 | 전체 회사 기본 ON |

RPC 이름은 Stage D 생산자 계약 병합 후 확정한다. 04에 전달하는 인터페이스는 회사·주문 ID·검증된 completion event ID·completed revision이며, 재고 `sale_out`의 호출 주체와 같은 트랜잭션 여부는 별도 승인 전까지 구현하지 않는다. 미래 발주·입고까지 한 함수에 넣지 않는다.

## 금액·추적 불변식

- `has_market_price=true` 또는 단가가 null인 주문은 매출전표 생성을 거부한다.
- 주문 줄의 `supply_amount`, `tax_amount`, `total_amount`와 전표 줄 생성식의 결과가 모두 일치해야 한다.
- 주문의 배송비를 전표에 넣는 규칙은 현재 전표 줄에 전용 품목 계약이 없으므로 별도 결정 전 임의 줄을 만들지 않는다.
- 주문 후 상품명·규격·단위·가격·과세가 바뀌어도 전표는 주문 스냅샷을 사용한다.
- 주문 추적은 `source_type='order'`, `source_id=order_id`, `source_key`로 하며 같은 회사에서 주문당 매출전표는 하나다.
- 전표 확정과 원장 생성은 한 DB 트랜잭션에서 모두 성공하거나 모두 롤백한다.
- inventory resolve 결과 수는 전표 줄 수와 같아야 하고 모든 줄이 `ok`여야 한다. 하나라도 실패하면 전표·원장·재고를 모두 남기지 않는다.

## 완료 취소·반품 이벤트 생산자 계약 초안

이 절은 03 전표·원장이 후속 이벤트를 안전하게 소비하기 위한 **최소 입력 계약**만 정의한다. 02/09의 테이블·RPC·상태 전이·권한 구현을 승인하거나 대신 설계하지 않으며, 현재 #384 SQL에는 연결하지 않는다.

### 공통 불변식

- 완료 취소와 반품은 원 배송 완료 이벤트를 수정·삭제하지 않는 별도 불변 이벤트다.
- 각 이벤트는 최소한 `companyId`, 새 `eventId`, `originalCompletionEventId`, `orderId`, 생산자가 확정한 order revision, `occurredAt` UTC instant, 서버가 확정한 actor를 영속 관계로 제공한다.
- 같은 `eventId`와 같은 정규화 입력의 재시도만 같은 결과를 반환한다. 회사·원 완료 이벤트·주문·revision·시각·actor·품목 범위 중 하나라도 다르면 충돌한다.
- 03은 API 성공 응답이나 가변 주문 상태만으로 이벤트를 추정하지 않는다. 회사 경계가 있는 영속 이벤트와 주문 관계를 함께 잠그고 현재 revision을 검증한다.
- 생산자는 원 완료 이벤트와 새 이벤트가 같은 회사·주문에 속함을 보장하고, 원 완료 이벤트의 삭제나 관계 변경으로 감사 연결이 끊기지 않게 한다.
- 시각은 표현 문자열이 아닌 같은 UTC instant로 비교한다. 이벤트 ID와 주문 ID는 서로 대체하지 않는다.
- 원천 이벤트 생산자는 두 안 모두 09다. 권장 A안의 03 wrapper는 승인된 09 완료 함수를 같은 트랜잭션에서 호출할 뿐, void/return 원천 이벤트를 임의 생성하지 않고 영속 관계만 소비한다.

### 완료 취소(void)

- 완료 취소 이벤트는 원 배송 완료 전체를 무효화한다. 부분 수량 취소는 void가 아니라 반품 계약을 사용한다.
- 생산자는 중복 void, 이미 반품이 연결된 완료의 void, 다른 회사·주문·완료 이벤트 참조를 거부해야 한다.
- 03 소비자는 원 주문의 매출전표가 없으면 전표를 새로 만들지 않는다. 확정 매출전표가 있으면 기존 `cancel_business_document` 규칙과 누적 반품 유무를 다시 검증하고, 같은 void event 재시도에 reversal을 한 번만 만든다.
- void용 downstream source key는 승인 시 새 이벤트 ID를 포함해 원 주문 source key와 분리한다. 정확한 문자열과 호출 주체는 생산자 계약 승인 뒤 확정한다.

### 반품(return)

- 반품 이벤트는 원 배송 완료와 주문을 참조하는 별도 이벤트이며, 반품 품목마다 안정된 주문 줄 ID와 양의 수량을 제공한다. 상품 현재값이나 화면 표시명으로 줄을 식별하지 않는다.
- 생산자는 같은 이벤트 내 중복 줄, 주문에 없는 줄, 누적 배송 수량을 넘는 반품, 다른 회사·주문·완료 이벤트 참조를 거부해야 한다.
- 03 소비자는 기존 원 매출전표와 같은 거래처·order ID를 확인하고 기존 `sale_return` 한도 검증을 재사용한다. 같은 return event 재시도에는 같은 반품전표를 반환하고 별도 원장 경로를 만들지 않는다.
- 반품 사유·증빙이 필수인지, 재고 입고와 같은 트랜잭션인지, 반품 이벤트 자체의 취소 생산자는 별도 승인 사항이다.

### 승인 전 차단

- A안의 회사별 Stage E 플래그 소유자·wrapper 실행 권한·09 함수 호출 계약, 이벤트 상태 전이와 revision 증가 규칙, 권한·RLS, 보존·down 정책이 확정되지 않았다.
- void/return과 04 재고 이동의 순서·원자성·보상 책임이 확정되지 않았다.
- 위 항목의 승인과 폐기형 PG17 동시성·멱등·회사 격리 검증 전에는 SQL, API, 플래그, 운영 적용을 추가하지 않는다.

## Stage E 전체 체크리스트

### 첫 주문 → 매출전표

- [x] `delivered` 주문과 같은 completion event·completed revision 관계가 있을 때만 전표 생성
- [x] 같은 주문 재시도에 같은 전표 반환
- [ ] 같은 주문의 동시 요청에도 전표·원장 각각 1건
- [x] 다른 회사 주문 참조 거부
- [ ] 시가 품목·빈 단가·0줄 주문·합계 불일치 전체 거부
- [x] 지원 범위의 주문 가격·과세·수량 스냅샷과 전표 줄·헤더 합계 일치
- [x] 주문 ID로 전표와 원장을 역추적 가능

### 거래처원장·입금

- [x] 전표 확정 시 `sale` 원장 1건과 미수 증가
- [ ] 기존 `record_partner_payment` 재시도에 입금 1건
- [ ] 전표·입금 후 원장 합계와 화면 기초/기말 잔액 일치
- [ ] 다른 회사 거래처 입금 거부와 공개 역할 실행 거부

### 취소·반품

- [ ] 출고 전 주문 취소는 매출전표를 만들지 않음
- [x] 확정 전표 취소는 기존 `cancel_business_document` reversal 1건, 재조회는 같은 취소 전표 반환
- [x] 반품은 원전표·같은 거래처·같은 order ID의 `sale_return`으로 기록되고 기존 ERP가 누적 반품 한도를 검증
- [x] 매출·반품 각각의 취소 reversal 후 order ID 기준 원장 순액 0

### 재고·롤백

- [x] 폐기형 PG17에서 전체 줄 resolve 성공 주문의 04 `sale_out`이 주문당 한 번만 기록됨
- [x] 성공/실패 resolve 줄이 섞인 주문은 전표·원장·재고를 모두 남기지 않음
- [ ] 주문 출고·전표·원장·재고 중 하나라도 실패하면 부분 저장 없음
- [ ] 기능 플래그 OFF 회사는 기존 주문·ERP 동작 유지
- [ ] 운영 적용 실패 시 플래그 OFF, 생성된 전표·원장은 삭제하지 않고 수정 SQL로 복구

### 권한·운영 검증

- [ ] `public/anon/authenticated` RPC 실행 불가, service role만 허용
- [ ] 폐기 가능한 PostgreSQL 17에서 회사 격리·멱등·동시성·원자성 검증
- [ ] 기존 ERP 수기 전표·확정·취소·입금 회귀 없음
- [ ] 테스트·타입 검사·린트·인증 경계·보안 감사·빌드·반응형 CI 통과
- [ ] 운영 DB 적용, 회사별 플래그 ON, 대표 회사 쓰기 스모크는 각각 별도 승인

## 변경 파일 예상

최신 main 기준 최소 초안은 아래 네 파일로 제한하며 앱 호출 코드는 포함하지 않는다.

1. `docs/sql-drafts/20261106-store-order-to-sales-ledger.sql`
2. `docs/sql-drafts/20261106-store-order-to-sales-ledger.down.sql`
3. `docs/sql-drafts/20261106-store-order-to-sales-ledger.pg17.test.sql`
4. `tests/sql/store-order-sales-ledger-fixture.pg17.sql`

앱 호출 코드는 Stage D 상태 계약과 SQL 승인 뒤 별도 PR로 추가한다.

`lib/store.ts`, 09의 링크/주문 화면·API, 01 TMS, 07 인증 helper, 중앙 승인표는 이 작업에서 수정하지 않는다. UI 변경이 없으므로 별도 PC/390px 화면은 만들지 않고 기존 ERP 원장 화면의 회귀 스모크만 수행한다.

## 승인

- 03 읽기 검토: 완료
- #384 격리 PG17·CI 검증: 완료, Draft 유지
- Stage D #410 생산자 DB 승인·병합·적용 순서: 대기
- SQL 초안 병합 승인: 대기
- 운영 DB 적용 승인: 없음
- 기능 ON 승인: 없음
- `DB-APPROVED:` **없음**
