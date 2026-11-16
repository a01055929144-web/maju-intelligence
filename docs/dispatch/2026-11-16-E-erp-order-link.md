# E단계 ERP 연결 — 주문 → 매출 전표 · 원장 · 재고 · 취소/반품 (2026-11-16 15:30 대표 결정)

> "erp연결부터 진행하자" — 체크리스트 E: [ ] 주문 매출전표 · [ ] 원장 · [ ] 재고 · [ ] 취소/반품 검증.
> 담당: **Codex 06·09방** (R3 대기열) · Owner Domain: sales(erp) · Related: order · inventory · customer

## 1. 지금 있는 것 (11/16 운영 DB·main 확인)

| 있음 | 내용 |
| --- | --- |
| 전표 | `business_documents`·`_lines`, `source_type`에 `'order'` 허용, **`(company_id, source_type, source_key)` UNIQUE**(멱등 준비됨). 상태 draft → confirmed → cancelled |
| 확정·취소 RPC | `confirm_business_document`(합계 검증 + 원장 `partner_ledger_entries` 기록, 한 트랜잭션) · `cancel_business_document`(반대 금액 원장 1건, 원본 보존) · `save_business_document`(수기 전표 — **source 인자 없음**) |
| 재고 | `business_documents_inventory_trigger` → `apply_inventory_for_document`(확정 때 `inventory_movements`·`inventory_balances`, `product_inventory_settings`에 등록된 상품만) |
| 주문 | `store_orders`(submitted → received → in_delivery → delivered / cancelled, 후불), `store_order_lines`(시가 줄은 `unit_price` NULL, 과세/면세, 배송비는 주문 헤더 `delivery_fee`) |
| 화면 | 주문 확인 `app/orders/page.tsx` + `components/order-inbox-workspace.tsx`(접수 = `/api/orders` PATCH), 전표 `components/business-document-workspace.tsx`, 원장 `/api/partner-ledger` |

**없는 것: 주문 → 전표를 만드는 연결.** 지금 운영 전표·주문·원장·재고 모두 0건이라 옮길 데이터 없음.

## 2. 흐름 (대표 확인 필요 항목은 5절 — 기본값으로 진행)

| 주문 상태 | 전표 | 원장 | 재고 |
| --- | --- | --- | --- |
| 접수(`received`) | **매출 전표 초안** 자동 생성(`source_type='order'`, `source_key='order:<id>'`, 이미 있으면 그대로 = 멱등) | 없음 | 없음 |
| 접수 뒤 주문 수정(revision 증가) | 초안이면 줄 다시 맞춤 | — | — |
| 배송 완료(`delivered`) | **확정**(`confirm_business_document`) — 시가 줄 단가가 비어 있으면 확정 막고 주문 확인 화면에 "단가 입력 필요" | 매출 +(기존 RPC) | 출고 −(기존 트리거, 설정된 상품만) |
| 취소(`cancelled`) — 확정 전 | 초안 버림(전표 `cancelled`) | 없음 | 없음 |
| 취소 — 확정 뒤 | `cancel_business_document` | 반대 금액 1건 | 되돌림 |
| 일부 반품 | **반품 전표**(`sale_return`, `original_document_id` = 주문 전표), 줄·수량 선택 | 매출 − | 입고 + |

- 전표 줄 = 주문 줄 그대로(상품·규격·단위·과세구분·수량·단가 스냅샷). **배송비 > 0 → "배송비" 과세 줄 1개.**
- 시가 줄 → 초안에서 단가 0 + 메모 `시가`, 확정 전 반드시 입력(기존 0원 경고 CC-30 E1 재사용).
- 상태 바꾸기와 전표 처리는 **같은 요청에서**, 전표 처리가 실패하면 주문 상태는 바뀌되 주문 확인 화면에 "전표 연결 실패 · 다시 시도" 표시(오류를 숨기지 않음). 다시 시도는 멱등.
- 기능 스위치 `ERP_ORDER_DOCUMENTS` **기본 OFF + 회사 allowlist**(대표 회사만 먼저). 돈이 오가는 기능이라 다른 고객사에 켜기는 대표 승인.

## 3. 작업 (Codex)

| ID (방) | 할 것 | DB | Files |
| --- | --- | --- | --- |
| **CX-38** (06) | **SQL 초안**: `create_sale_document_from_order(p_company_id, p_order_id, p_actor_user_id, p_actor_name)` — 회사 범위 확인 · 주문 `received` 이상만 · 멱등(UNIQUE source_key, 있으면 그 id 반환) · 초안이면 주문 줄로 다시 맞춤 · 배송비 줄 · 시가 줄 0+메모 · 거래처·담당자·권역 스냅샷 · 전표번호는 수기 전표와 같은 규칙 · `admin_audit_logs` 기록. `discard_order_sale_document(p_company_id, p_order_id, …)` — 초안이면 cancelled, 확정이면 `cancel_business_document` 호출. 둘 다 `security definer` + `service_role`만 실행. **down + PG17 시험**(멱등 2회 호출 = 1건 · 다른 회사 주문 거부 · 시가 줄 · 배송비 · 취소 두 경우) | **필요(승인)** | `docs/sql-drafts/2026-11-16-order-sale-document*.sql` · `tests/sql/…` · 승인 md |
| **CX-39** (09) | 앱 연결: `domains/erp/order-document.ts`(순수: 주문 → 전표 줄 미리보기·검증, 시가 줄 찾기) · `lib/business-documents.ts`에 RPC 호출 2개 · `/api/orders` 상태 변경에서 스위치 ON일 때만 위 2절대로 호출 · 주문 확인 화면 주문 행에 "전표" 칸(없음 / 초안 / 확정 · 번호 / 실패 · 다시 시도) + 시가 단가 입력 안내 · 전표 상세에 "주문에서 만듦" 링크 · 매출처 원장 줄에 주문 번호 | 없음(CX-38 적용 뒤 켬) | 위 파일 + `components/order-inbox-workspace.tsx` · `components/business-document-workspace.tsx` · 시험 |
| **CX-40** (06, CX-38 뒤) | 반품: 주문 상세에서 "반품 전표 만들기"(줄·수량 선택, 원 수량 넘으면 막음) → 기존 반품 전표 저장·확정 경로 재사용(`sale_return` + `original_document_id`). 새 DB 함수가 필요하면 CX-38과 같은 승인 절차 | 필요하면 승인 | 반품 화면·API·시험 |
| **CX-41** (09, CX-39·40 뒤) | **E 검증 통합 시험**(stage-a 방식, PG17 + 가짜 매장): 주문 → 접수(초안 1건, 두 번 눌러도 1건) → 배송 완료(확정·원장 +·재고 −) → 반품(원장 −·재고 +) → 다른 주문 취소(확정 전 초안 버림 · 확정 뒤 반대 원장) · 원장 잔액 = 합계. 결과를 체크리스트 E 4칸 근거로 PR 본문에 | 없음 | `tests/integration/erp-order-link.spec.ts` · 워크플로 줄 추가 |

순서: CX-38(06) ∥ CX-39(09, 스위치 OFF로 먼저 병합 가능) → **대표 승인 → 컨트롤타워 적용** → CX-40 → CX-41 → 대표 회사 스위치 ON → 운영 첫 주문으로 확인.

## 4. 지키는 것

- 확정 전표·원장은 지우지 않는다(취소·반품으로만). 화면에서 전표 실패를 숨기지 않는다.
- `lib/store.ts`는 손대지 않는다(03방 CX-34 중). 주문 관련 코드는 `lib/business-documents.ts`·`domains/erp`·`domains/order`에.
- 기존 수기 전표·매입 전표(E2) 동작 변화 없음 — 기존 시험 통과.
- 가짜 값만(매장·전화·사업자번호). 검증·Ponytail·squash·배포 잠금은 R2 Codex 0절.

## 5. 대표 확인 (말씀 없으면 아래 기본값)

1. 전표 확정 시점 = **배송 완료**(배송 기능 전이므로 주문 확인 화면에서 "배송 완료"를 누를 때). 접수 때 바로 확정을 원하시면 말씀.
2. 시가 품목은 **확정 전에 단가 입력 필수**.
3. 배송비는 **전표의 과세 줄**로 넣음.
4. 스위치는 **대표 회사만** 먼저 켬.
