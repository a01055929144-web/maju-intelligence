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

#397로 Stage D의 주문 ID·부분 완료 소비자 계약은 병합됐지만, 09 소유의 단일 완료 상태/RPC와 주소 snapshot 생산자 계약은 아직 확정되지 않았다. 현재 `store_orders.status`에는 `closed`가 없고 기존 문서끼리도 매출전표 생성 시점을 `received`, `in_delivery` 또는 출고 확정으로 표현한다. #384의 세 상태는 폐기형 PG17 후보 fixture일 뿐 운영 계약이 아니다. 아래 생산자 계약이 병합되기 전에는 Ready 전환·병합·운영 적용·호출 코드 연결을 하지 않는다. 서버 호출 코드와 회사별 활성화가 없으므로 기능은 OFF다. 오래된 #281은 #384로 대체되어 종료했으며 두 SQL을 함께 적용하지 않는다.

1. 전표 생성이 허용되는 단일 주문 상태와 전환 주체
2. 취소 주문·미확정 시가 품목·수정 중 주문의 거부 규칙
3. 배송 완료와 출고 확정의 순서 및 재시도 계약
4. 재고 `sale_out` 소유 RPC와 전표 생성의 같은 트랜잭션 여부

가칭 거래처는 폐기 가능한 PG17 fixture에만 두며 운영 백필이나 운영 주문 생성에 사용하지 않는다.

## 최소 승인 범위

| 항목 | 최소안 | 제외 |
| --- | --- | --- |
| 진입점 | 주문 ID·멱등 키·행위자를 받는 service-role RPC 1개 | 09 주문 API/UI 수정 |
| 잠금 | `(company_id, order_id)` 주문을 잠그고 승인된 출고 상태 확인 | TMS 상태 복제 |
| 전표 | 기존 `business_documents`에 `document_type='sale'`, `source_type='order'`, `source_id=order_id`, `source_key='store_order:' || order_id` | 새 매출 테이블 |
| 전표 줄 | `store_order_lines`의 상품명·규격·단위·수량·단가·과세 스냅샷을 그대로 복사 | 현재 상품/가격 재조회·재계산 |
| 원장 | 기존 `confirm_business_document`를 호출해 `document:{id}:confirm` 1건 생성 | 별도 원장 INSERT 경로 |
| 중복 방지 | 기존 source key UNIQUE와 같은 주문 재조회로 원래 전표 반환 | 중복 요청 테이블 |
| 회사 경계 | 주문·거래처·상품·전표를 모두 입력 회사로 검증 | 공개/클라이언트 직접 실행 |
| 기능 제어 | 회사별 Stage E 플래그 기본 OFF, 승인 회사만 서버에서 호출 | 전체 회사 기본 ON |

RPC 이름과 정확한 상태값은 Stage D 생산자 계약 병합 후 확정한다. 이름을 먼저 고정하거나 미래 발주·입고까지 한 함수에 넣지 않는다.

## 금액·추적 불변식

- `has_market_price=true` 또는 단가가 null인 주문은 매출전표 생성을 거부한다.
- 주문 줄의 `supply_amount`, `tax_amount`, `total_amount`와 전표 줄 생성식의 결과가 모두 일치해야 한다.
- 주문의 배송비를 전표에 넣는 규칙은 현재 전표 줄에 전용 품목 계약이 없으므로 별도 결정 전 임의 줄을 만들지 않는다.
- 주문 후 상품명·규격·단위·가격·과세가 바뀌어도 전표는 주문 스냅샷을 사용한다.
- 주문 추적은 `source_type='order'`, `source_id=order_id`, `source_key`로 하며 같은 회사에서 주문당 매출전표는 하나다.
- 전표 확정과 원장 생성은 한 DB 트랜잭션에서 모두 성공하거나 모두 롤백한다.

## Stage E 전체 체크리스트

### 첫 주문 → 매출전표

- [x] 현재 허용 후보 상태의 주문만 전표 생성, `submitted/cancelled` 거부
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

- [ ] 04 소유 `sale_out`이 주문당 한 번만 기록됨
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
- Stage D 상태 계약: 대기
- SQL 초안 병합 승인: 대기
- 운영 DB 적용 승인: 없음
- 기능 ON 승인: 없음
- `DB-APPROVED:` **없음**
