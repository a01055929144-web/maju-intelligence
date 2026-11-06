# 스토어 주문 → 기존 매출 전표·원장 DB 승인 초안

> 상태: 승인 전 · 운영 실행 금지 · 기능 OFF
> 소유: 03 거래처·전표·원장
> 운영 프로젝트 `fcmdvveqmcgtioelzqun`에는 이 문서의 SQL을 실행하지 않는다.

## 결론

새 주문·원장 테이블을 만들지 않는다. P2의 `store_orders`/`store_order_lines`를 원본으로 삼아 ERP 1단계의 `business_documents`/`business_document_lines`에 멱등 매출 초안을 만들고, 원장 기표는 기존 `confirm_business_document`만 수행한다. 공개 `/store` 주문 트랜잭션에서 전표 확정이나 원장 기표를 하지 않는다.

현재 ERP 행은 세금 별도 단가만 표현하고 전표 합계에 배송비 칸이 없다. 따라서 1차 연결은 다음 주문만 허용한다.

- 시가 품목 없음
- 모든 행이 `price_includes_tax=false`
- `delivery_fee=0`
- 주문 상태가 `received/in_delivery/delivered` 중 하나여서 P2 주문 수정 RPC로 더 이상 수정할 수 없음
- 주문 저장 합계와 주문 행 재계산 합계 일치

세금 포함가 또는 배송비를 억지로 환산하면 원 단위 스냅샷이 달라질 수 있으므로 자동 변환하지 않고 명시적 오류로 보류한다.

## 09 → 03 계약

09의 인증된 서버 Use Case만 아래 값을 전달한다.

```ts
type CreateSalesDocumentFromStoreOrder = {
  companyId: string;      // 인증 범위에서 유도
  storeOrderId: string;
  actorUserId: string;
  actorName: string;
};
```

가격, 합계, 거래처, 문서 상태는 요청에서 받지 않는다. 03 RPC가 잠근 주문과 행에서 다시 읽는다.

```ts
type StoreOrderSalesDocumentResult = {
  storeOrderId: string;
  salesDocumentId: string;
  status: "draft" | "confirmed" | "cancelled";
  alreadyCreated: boolean;
  ledgerPosted: boolean;
};
```

`source_type='order'`, `source_id=store_orders.id`, `source_key='store_order:' || id`를 사용한다. 같은 주문 재요청은 같은 전표를 반환한다. 주문 회사와 요청 회사가 다르면 존재 여부를 드러내지 않고 거부한다.

## 책임과 흐름

1. `create_sales_document_from_store_order`가 회사·주문 조합 advisory lock을 잡는다.
2. 기존 source key 전표가 있으면 그대로 반환한다.
3. 주문과 행을 회사 범위로 잠그고 위 지원 범위를 검증한다. `submitted`는 기존 P2 수정 가능 상태이므로 전표를 만들지 않는다.
4. 기존 `next_erp_number`로 매출 번호를 만들고 초안 헤더를 추가한다.
5. 기존 `save_business_document`에 주문 행 스냅샷을 넘겨 합계를 다시 계산한다.
6. 저장 합계가 주문 스냅샷과 다르면 전체 트랜잭션을 롤백한다.
7. 직원의 별도 확정 동작이 기존 `confirm_business_document`를 호출하면 append-only 원장에 한 번 기표된다.
8. 취소·반품은 기존 ERP 취소·반품 계약을 재사용하며 이 RPC가 새 경로를 만들지 않는다.

## 권한·감사 경계

- 함수는 `SECURITY DEFINER`, 빈 `search_path`, 모든 조회에 `company_id`를 사용한다.
- `public`, `anon`, `authenticated` 실행 권한을 회수하고 `service_role`만 실행한다.
- API는 호출 전에 직원 인증·회사 범위·ERP 권한을 확인한다. 함수의 service role 권한을 사용자 권한으로 간주하지 않는다.
- 원시 링크 토큰, 공개 요청 가격, 공개 요청 회사 ID를 저장하지 않는다.

## 승인 전 검증

PG17은 자체 ERP mock을 쓰지 않는다. 가격 P0/P1 합성 선행 객체 뒤 실제 운영 기록 마이그레이션 `20261016190000_erp_phase_1_documents_ledger.sql`, `20261016200000_erp_phase_1b_v2.sql`, `20261102114602_pricing_p2_store_ordering.sql`을 순서대로 적용해 GENERATED 금액 칸, 변경 가드, 실제 저장·확정 RPC와 함께 검증한다.

- [ ] 같은 주문 재요청이 전표 하나와 같은 결과로 수렴
- [ ] `submitted` 주문은 전표 생성 거부, `received` 뒤 생성한 전표가 존재하면 실제 P2 수정 RPC도 거부
- [ ] 다른 회사 주문 참조 거부
- [ ] 시가·세금 포함가·배송비·취소 주문 거부
- [ ] 주문 합계와 전표 합계 불일치 시 전체 롤백
- [ ] 초안 생성만으로 원장 행이 생기지 않음
- [ ] 기존 확정 RPC가 원장 한 건을 만들고 재확정은 거부
- [ ] `anon/authenticated` 직접 실행 거부
- [ ] down은 함수만 제거하고 기존 전표·원장을 보존

## 파일과 적용

- 적용 초안: `docs/sql-drafts/20261106-store-order-to-sales-ledger.sql`
- 복구 초안: `docs/sql-drafts/20261106-store-order-to-sales-ledger.down.sql`
- PG17: `docs/sql-drafts/20261106-store-order-to-sales-ledger.pg17.test.sql`

승인 후에도 먼저 합성 PostgreSQL 17에서 검증하고 기능 플래그를 OFF로 배포한다. 운영 적용과 기능 활성화는 각각 별도 승인이다.

## 승인

- Claude 검토: 대기
- 대표 승인: 대기
- `DB-APPROVED:` 없음
