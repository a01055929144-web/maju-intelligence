# CX-38 주문 확정 → 매출 전표·수령 확인 — DB 승인 요청

## 상태와 범위

- SQL 초안 검토용이며 운영 DB에는 적용하지 않았다.
- up: `docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.sql`
- down: `docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.down.sql`
- PG17 시험: `docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.pg17.test.sql`
- 앱 화면, 기능 스위치, `lib/store.ts`, 공용 UI는 변경하지 않는다.

## 재사용하는 기존 객체

- 주문: `store_orders`, `store_order_lines`
- 전표·원장: `business_documents`, `business_document_lines`, `partner_ledger_entries`
- 확정·수정·취소: `confirm_business_document`, `save_business_document`, `cancel_business_document`
- 재고: 기존 `business_documents_inventory_trg`와 `apply_inventory_for_document`
- 시가 제안: `pricing_p0_effective`, `pricing_p0_price`
- 수령 사진: `customer_attachments`

새 회계·재고 계산은 만들지 않는다. 주문 RPC는 주문 줄을 전표 줄 JSON으로 바꾸고 위 기존 경로를 호출한다.

## 추가 객체

- `business_document_receipts`: 전표 revision별 수령 확인 또는 이상 신고 1건
- `order_sale_document_lines`: 주문 줄 변환용 내부 함수
- `confirm_order_sale_document`: 주문별 `source_key='order:<id>'` 전표 1건을 만들고 기존 확정 경로 호출
- `revise_order_sale_document`: 현재 주문 줄과 다를 때만 기존 저장 경로 호출
- `cancel_order_sale_document`: 기존 취소 경로 호출
- `record_business_document_receipt`: 활성 매장 회원과 전표 거래처 범위를 확인하고 revision별 기록

모든 함수는 `security definer`, 빈 `search_path`, `service_role` 전용이다. 테이블은 RLS를 켜고 브라우저 역할 권한을 주지 않는다.

## 승인 질문

CX-38 up 초안을 운영 DB에 한 번 적용해도 되는가?

- 적용만으로 주문 흐름은 바뀌지 않는다. CX-39 앱과 `ERP_ORDER_DOCUMENTS` 스위치가 별도 배포되기 전에는 호출되지 않는다.
- 기존 행을 갱신하거나 초기 데이터를 넣지 않는다.
- `lock_timeout = '3s'`, `statement_timeout = '30s'`인 한 트랜잭션이다.
- 운영 적용은 대표 승인 뒤 컨트롤타워만 수행한다.

## 보장과 PG17 결과

- 같은 주문 확정 두 번 = 전표·원장·재고 각 1회
- 다른 회사 주문 ID 거부
- 과세·면세 줄 유지, 시가 줄은 매입가 + 기존 상품 마진 제안 단가
- 배송비는 과세 줄로 추가
- 수정 재시도는 revision 증가 없음, 실제 수정은 기존 전표 revision +1과 차액 원장·재고만 기록
- 수정 뒤 전표 원장 순액 = 새 전표 합계
- 세금계산서 잠금 전표 수정 거부
- 취소 재시도 안전, 취소 뒤 원장·재고 순액 0
- 수령 확인은 활성 매장 회원·같은 거래처·현재 전표 revision만 허용하고 같은 입력 재시도는 같은 행 반환
- PostgreSQL 17 일회용 컨테이너에서 up, 위 계약, down 거부/성공 왕복 통과

## 적용 전 읽기 점검

```sql
select count(*) from public.store_orders;
select count(*) from public.business_documents where source_type = 'order';
select to_regclass('public.business_document_receipts');

select proname, prosecdef, proacl
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'confirm_business_document', 'save_business_document', 'cancel_business_document',
    'confirm_order_sale_document', 'revise_order_sale_document',
    'cancel_order_sale_document', 'record_business_document_receipt'
  )
order by proname;
```

적용 전 수령 확인 테이블과 새 함수 4개는 없어야 한다. 주문·주문 출처 전표 건수는 적용 후에도 같아야 한다.

## 적용 후 읽기 검증

```sql
select count(*) from public.store_orders;
select count(*) from public.business_documents where source_type = 'order';
select count(*) from public.business_document_receipts;

select relrowsecurity, relforcerowsecurity, relacl
from pg_class
where oid = 'public.business_document_receipts'::regclass;

select proname, prosecdef, proconfig, proacl
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'order_sale_document_lines', 'confirm_order_sale_document',
    'revise_order_sale_document', 'cancel_order_sale_document',
    'record_business_document_receipt'
  )
order by proname;
```

주문·주문 출처 전표 건수는 전과 같고 수령 확인은 0건이어야 한다. 새 함수는 모두 `prosecdef=true`, `search_path=""`, service_role만 실행 가능해야 한다.

## down과 보존

- 먼저 CX-39·CX-42 호출을 끄고 이전 앱으로 되돌린 뒤 별도 승인을 받는다.
- 수령 확인이 1건이라도 있으면 down은 의도적으로 실패한다. 수령 증거를 자동 삭제하지 않는다.
- 전표·원장·재고는 기존 객체의 정식 기록이므로 down이 삭제하거나 되돌리지 않는다.
- 수령 기록이 0건일 때만 새 함수·테이블과 사진 복합 FK용 제약을 제거한다.

## 확인 못 함

- 운영 DB 적용과 운영 데이터: 하지 않음
- 앱 화면·기능 스위치: CX-39·CX-42 범위
