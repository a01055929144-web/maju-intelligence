# 계약과 현재 코드의 차이

기준: [00_BACKEND_CONTRACT.md](00_BACKEND_CONTRACT.md). 이 목록은 구현 완료 주장과 승인되지 않은 DB 변경을 막기 위한 것이다. **초안 SQL은 운영 적용으로 간주하지 않는다.**

| ID | 계약 규칙 | 현재 근거 · 차이 | 다음 순서 |
|---|---|---|---|
| <a id="g1"></a>G1 | I-4 · I-7 · I-9 | P2 `store_orders.status`에는 `closed`가 없고, `channel`도 없다. 링크 주문은 P2 `place_store_order` RPC로 저장하지만 6절 단일 `resolve_price`는 없다. | E: 가격 결정·주문 상태·직접 주문 |
| <a id="g2"></a>G2 | I-2 · I-3 · I-5 | `confirm_business_document`와 재고 트리거는 있지만 매장 주문의 출고 확정 → 매출전표 1건 → `customer_items` 갱신이 연결되지 않았다. | D-최소 → E → F |
| <a id="g3"></a>G3 | I-7 · I-8 | 정식 `purchase_orders`/`purchase_order_items`와 CreatePurchaseVoucher RPC·API가 없다. 일부 과거 초안 이름은 계약 2절과 다르다. | F |
| <a id="g4"></a>G4 | I-7 | 기존 상품 가져오기는 `product_catalog_imports`·`supplier_products` 경로다. 계약의 `import_jobs/import_rows` + 이전 값 기반 원자 적용·되돌리기는 SQL 초안 단계다. | B 마무리 |
| <a id="g5"></a>G5 | I-2 · I-6 | `partner_ledger_entries`는 기존 원장이다. `deposit`/`deposit_apply`/`deposit_refund` 유형과 거래처별 행 잠금·0 미만 차단은 없다. | D-나머지, 돈 기능 승인 후 |
| <a id="g6"></a>G6 | 가격 0·1·2순위 | `customer_price_agreements`와 기존 `sales_quotes` 수락 경로는 있지만 새 `pricing_documents`의 `sheet`/`quote` 단일 수락 RPC가 없다. 새 문서 ID를 기존 수락 API에 전달할 수 없으며, 견적의 협의 단가·우선순위 1 연결과 단가표의 우선순위 2 연결도 미구현이다. | E |
| <a id="g7"></a>G7 | 9절 권한 | `lib/workspace.ts`는 driver/member/temporary에도 `manage_sales`를 주며, 전표·원장 API가 이를 사용한다. 경리 역할과 돈 조회/변경 분리가 목표와 다르다. | D-최소 전 권한 설계 |
| <a id="g8"></a>G8 | I-1 · I-11 | B 단계 `20261102-WO-03-unit-conversion-bplus.sql`과 `20261102-WO-25-product-base-prices.sql`은 회사 복합 FK·상품/날짜 유일성까지 PG17을 통과했지만 여전히 SQL 초안이며 운영 미적용이다. | B 운영 승인 대기 |
| <a id="g9"></a>G9 | I-12 | 홀수·짝수·빈 관측의 중앙값 순수 함수/테스트는 있다. 매입가 제안에서 실제로 단일 함수를 쓰는지 통합 검증이 필요하다. | B |
| <a id="g10"></a>G10 | I-10 | CI는 신규 `supabase/migrations` 파일 PR에 승인 줄을 요구한다. 기존 파일 수정·운영 SQL 수동 실행 자체는 CI가 증명하지 못하므로 운영 이력은 별도 읽기 검증이 필요하다. | 매 단계 |

## 검증 연결

| 규칙 | 기존 증거 / 새 테스트 상태 |
|---|---|
| I-1 | 적용된 P0~P2와 B 단계 단위 환산·가져오기 감사·회사별 칸·기준 단가 초안의 `company_id`를 계약 테스트가 확인한다. 초안의 운영 적용 여부는 별도다. |
| I-2 | ERP 1단계 PG 검증은 있으나 예치금 유형은 G5로 보류. |
| I-3 | 재고 1단계 SQL의 멱등 구조가 있지만 주문 출고 연결은 G2. |
| I-4 | 단일 `resolve_price`가 없어 G1로 skip. |
| I-5 | 기존 확정 전표 스냅샷 규칙은 ERP PG 증거. 주문 출고 연결은 G2. |
| I-6 | G5로 skip. |
| I-7 | P2 주문 멱등과 기존 지급 RPC는 각각 검증. 신규 발주·가져오기 적용은 G3/G4로 skip. |
| I-8 | G3로 skip. |
| I-9 | `tests/storefront-contract.test.ts` 및 P2 경로 테스트; 매장 외 노출이 없는지 유지. |
| I-10 | `.github/workflows/ci.yml`의 migration-approval과 프로젝트별 `DB-APPROVED` 접두사를 계약 테스트가 고정한다. |
| I-11 | 기준 단가 초안의 회사 복합 FK·상품/날짜 유일성과 PG17 검증은 통과했다. 운영 미적용은 G8로 유지한다. |
| I-12 | `tests/unit-conversion.test.ts`의 홀수·짝수·fallback 검증. |

## 승인 표 추가 대상

기존 [DB 승인 대기표](../work-orders/db-approval-queue.md)의 P0→P1→P2는 적용 완료다. 다음 묶음은 **B 단위 환산·기준 단가 → D 최소 전표·원장 → E 링크 주문 수락·협의 단가 → F 출고·발주·입고** 순으로 별도 SQL·down·PG17 검증을 적고, 운영 변경은 묶음별 승인 후 실행한다. 예치금·지급과 WO-17/19는 여기서 착수하지 않는다.
