# 백엔드 지시서 — 주문 마감 · 출고 준비(발주) · 입고 · 매출전표 (2026-11-02 22:30 · Claude)

> **고정 규칙**: AGENTS.md 0-0 ~ 0-0-3. 이 문서는 계약서(`00_BACKEND_CONTRACT.md`) 2 · 4 · 5 · 7 · 8절을 구현 수준으로 풀어 쓴 것이다. 화면은 와이어프레임 v53 OrderSummary · OrderSheetImage · BuyVoucher · UnitSettings, 화면 스펙은 decisions-0824 2-4 · 2-5절을 따른다.
> 목표: **11/9까지 대표 회사에서 리드 → 주문 → 출고 준비 → 발주 → 입고 → 출고 → 매출전표**가 끝까지 된다.

## 0. 쓰는 테이블 (새로 만들지 않는 것 먼저)

| 용도 | 테이블 | 상태 |
|---|---|---|
| 주문 | `store_orders` / `store_order_lines` (P2) | 운영 적용됨. 칸 추가만 |
| 매입 · 매출 전표 | `business_documents` / `business_document_lines` | 운영(ERP 1단계). 칸 추가만 |
| 돈 | `partner_ledger_entries` | 운영. entry_type 추가는 D-나머지에서 |
| 재고 | `inventory_movements` · `inventory_balances` · `inventory_document_positions` | 운영. 그대로 |
| 단위 | `product_unit_conversions` (+ WO-03 bplus 초안) | 운영 + 초안 |
| 발주 | **`purchase_orders` · `purchase_order_items` (새로 만듦)** | 이 문서 |

## 1. DDL 초안 → `docs/sql-drafts/20261103-F-fulfillment.sql` (+ down · pg17.test)

```sql
-- 1) 주문 상태에 closed(마감) 추가, 마감 · 출고 시각
alter table public.store_orders drop constraint if exists store_orders_status_check;
alter table public.store_orders add constraint store_orders_status_check
  check (status in ('submitted','received','closed','in_delivery','delivered','cancelled'));
alter table public.store_orders
  add column if not exists channel text not null default 'link' check (channel in ('link','manual','phone')),
  add column if not exists closed_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists sale_document_id uuid;   -- (company_id, sale_document_id) → business_documents 복합 FK

-- 2) 줄 단위 출고 수량 · 발주 제외
alter table public.store_order_lines
  add column if not exists line_note text check (line_note is null or length(line_note) <= 200),  -- 매장 요청(비고)
  add column if not exists shipped_quantity numeric(14,3),
  add column if not exists excluded_from_po_at timestamptz,
  add column if not exists excluded_from_po_by text;

-- 3) 발주
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delivery_date date not null,
  supplier_id uuid not null,                      -- (company_id, supplier_id) → product_suppliers
  round text not null default 'night' check (round in ('night','day','extra')),
  status text not null default 'draft' check (status in ('draft','ordered','received','voucher_created','cancelled')),
  ordered_at timestamptz, ordered_by text,
  purchase_document_id uuid,                      -- 확정 매입전표 (발주 1 : 전표 1, I-8)
  idempotency_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  unique (company_id, idempotency_key),
  unique (company_id, delivery_date, supplier_id, round) -- 같은 날 · 매입처 · 회차는 하나
);
create unique index purchase_orders_one_voucher on public.purchase_orders(company_id, purchase_document_id) where purchase_document_id is not null;

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  purchase_order_id uuid not null,                -- 복합 FK
  product_id uuid not null,                       -- 복합 FK → product_catalog
  purchase_unit text not null,                    -- 매입 단위(박스 · kg · g · 개 …)
  order_qty numeric(14,3) not null check (order_qty >= 0),
  received_qty numeric(14,3),
  received_base_qty numeric(14,3),                -- 판매 단위로 환산(실중량 반영)
  prev_price bigint, base_price bigint, actual_price bigint,  -- 전일 · 기준 · 실제(영수증)
  note text check (note is null or length(note) <= 200),       -- 품목 비고
  carried_to_round text check (carried_to_round in ('day','extra')),
  unique (company_id, id)
);

-- 4) 발주 줄 ↔ 주문 줄 (어느 매장 몫인지 · 발주서 이미지 "매출처" 칸)
create table public.purchase_order_allocations (
  company_id uuid not null,
  purchase_order_item_id uuid not null,           -- 복합 FK
  store_order_line_id uuid not null,              -- 복합 FK
  quantity numeric(14,3) not null check (quantity > 0),
  primary key (company_id, purchase_order_item_id, store_order_line_id)
);

-- 5) 전표 출처
alter table public.business_documents drop constraint if exists business_documents_source_type_check;
alter table public.business_documents add constraint business_documents_source_type_check
  check (source_type in ('manual','order','quote','upload','legacy_import','purchase_order'));
-- RLS on · public/anon/authenticated 권한 회수 · service_role만 (P0~P2 · S-2와 같은 방식)
```

- 모든 FK는 `(company_id, id)` 복합이다(I-1).
- 기존 데이터는 백필하지 않는다. 기존 주문은 `channel='link'`.

## 2. RPC (트랜잭션 하나씩 · idempotency_key · 회사/권한 확인 뒤 service role로 호출)

| RPC | 하는 일 | 규칙 |
|---|---|---|
| `close_orders(company, delivery_date, cutoff_at, key)` | 그 배송일의 `submitted/received` 주문 → `closed`, `closed_at` | 마감 뒤 매장 수정 금지(요청 남기기만). 재실행해도 같은 결과 |
| `build_purchase_drafts(company, delivery_date, key)` | 마감 주문 줄을 **매입처(상품 주 매입처) × 회차(night)**로 묶어 `purchase_orders(draft)` + items + allocations 생성 | 사입할 양 = 주문 합 − 가능 재고(재고 추적 상품만, 계약서 7절). 이미 draft가 있으면 다시 계산(ordered 이후는 건드리지 않음) |
| `exclude_order_line_from_po(company, line_id, actor)` / `restore_…` | 출고 준비 화면의 − 버튼 | 매장 주문 수량은 그대로. allocation만 빼고 발주 수량 다시 계산 |
| `add_extra_po_line(company, delivery_date, supplier, product, qty, store_line?, key)` | + 버튼(추가 발주) | 회차 `extra` 발주에 붙인다 |
| `mark_purchase_ordered(company, po_id, key)` | 발주하기 → `ordered`, 시각 · 담당 | 발주서 이미지 · 카톡 문구는 이 시점 스냅샷 |
| `receive_and_create_purchase_voucher(company, po_id, lines[], payment?, save_base_price bool, key)` | 계약서 5절 `CreatePurchaseVoucher` 그대로 | 매입전표(confirmed, source=purchase_order) + 재고 purchase_in + 원장 purchase(+ 지급은 플래그 OFF) + `product_base_prices`(체크 시) + 덜 온 수량 → `carried_to_round='day'` 새 발주 줄 + 상태 `voucher_created`. **발주당 전표 1개**(I-8) |
| `ship_orders(company, delivery_date, order_ids[], key)` | 출고 확정 → `in_delivery` + 주문마다 **매출전표(confirmed, source=order)** 생성 → 재고 sale_out(계약서 7절: 이때 딱 한 번) + 원장 sale + `customer_items` 갱신 | 주문 줄 가격 스냅샷 그대로(I-5). 같은 주문 두 번 출고 → 전표 1개(I-3 · I-7) |
| `mark_delivered(company, order_id, proof?, key)` | 기사 배송 완료 → `delivered` | 기존 배송 완료 기록과 연결 |

- **출고 예정(가능 재고)**은 뷰로 계산한다: `closed` 상태이고 아직 `sale_document_id`가 없는 주문 줄의 합(계약서 7절). 예약용 이동 행은 만들지 않는다.
- **단위 환산**: 받은 수량 × `product_unit_conversions.base_quantity`.
  - 박스 실중량은 입력값이 우선이고, 없으면 최근 5회 **중앙값**(23차).
  - 재고 가치는 `inventory_balances.average_unit_cost`(이동 평균) 그대로 둔다.

## 3. 화면 ↔ RPC (Codex 구현 순서)

1. **출고 준비(OrderSummary)**
   - 흐름 표시줄 → [마감] `close_orders` → [집계] `build_purchase_drafts`.
   - 매입처 카드, 열은 품목 · 수량 · 단위 · 전일가 · 매출처 · 비고 · −.
   - + = `add_extra_po_line`, − = `exclude…`, [발주하기] = `mark_purchase_ordered`.
2. **발주서 이미지(OrderSheetImage)**: `ordered` 스냅샷으로 그린다. 단가는 빼고, 비고 칸만 노란색이다. PNG · 인쇄 · 카톡 글.
3. **입고 · 매입전표(BuyVoucher)**: `receive_and_create_purchase_voucher`. 기준 단가(회색 입력) · 실제 단가 · 단위 설정 버튼 · 지급 패널(플래그 OFF).
4. **출고 · 매출전표**: 출고 준비 ⑥ [매출 등록] = `ship_orders`. 거래명세표 인쇄는 기존 PrintStatement를 쓴다.
5. **피킹 · 상차 인쇄**: 기존 인쇄 부품 + allocations로 매장별 수량.

## 4. PG17 테스트 (`docs/sql-drafts/20261103-F-fulfillment.pg17.test.sql`)

- [ ] 다른 회사의 주문 · 상품 · 매입처 참조 거부
- [ ] `close_orders` 두 번 → 같은 결과
- [ ] `build_purchase_drafts`: 매입처 × 회차 묶음, 주문 합 − 가능 재고 = 사입할 양, ordered 이후 발주는 변경 없음
- [ ] − 빼기 · 되돌리기: 매장 주문 수량은 그대로, 발주 수량만 바뀜
- [ ] 입고 전표: 발주당 1개, 같은 key 재시도 → 전표 1개 · 재고 1번
- [ ] 덜 온 수량 → day 회차로 넘어감
- [ ] 박스 실중량 입력 · 중앙값 기본(9.3 · 9.5 · 9.6 → 9.5)
- [ ] `ship_orders`: 주문마다 매출전표 1개, 재고 sale_out 1번, 같은 주문 두 번 → 변화 없음
- [ ] 출고 예정 뷰 = closed 이고 전표 없는 줄의 합
- [ ] 출고 뒤 가격 · 기준 단가가 바뀌어도 전표 줄 단가는 그대로
- [ ] 17차 재고 시나리오 8단계 통과(매입 20 → 확정 4 → 출고 → 반품 1 → 직접 매출 2 → 맞추기 −1 → 재시도)

## 5. 승인 · 플래그 · 담당

- SQL · down · PG17 테스트 작성 → `docs/work-orders/db-approval/F-fulfillment.md` → Claude 검토 → 대표 승인.
- 플래그: `PURCHASE_ORDERS` (대표 회사만 켬, 돈 기능 아님), `VOUCHER_INLINE_PAYMENT`(지급 · 입금, OFF 유지).
- 담당: 03 = SQL · RPC(전표 · 원장 · 재고), 09 = 출고 준비 · 발주서 화면, 04 = 단위 환산 · 입고 화면, 02 = 기사 배송 완료 연결.
- 순서: SQL 초안 + PG17(11/3) → 승인 · 적용(11/4) → 화면(11/4~6) → 대표 회사 시험(11/7) → 실사용(11/9).
