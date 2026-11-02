# API · 트랜잭션 계약

기준: [00_BACKEND_CONTRACT.md](00_BACKEND_CONTRACT.md) 5절. **현재**는 저장소 코드에서 확인한 진입점이고, **목표**는 계약 요구다. 공개 매장 링크에는 직원 세션 대신 서명 토큰 범위가 적용된다.

| Use Case | 현재 경로 · 입력 | 출력 · 오류 | 권한 · 계약과 차이 |
|---|---|---|---|
| PlaceStoreOrder | `PUT /api/storefront`: token, idempotencyKey, deliveryDate, lines, memo, 선택적 orderId·expectedRevision | 주문 결과; 400 입력, 403 다른 Origin, 404 링크/플래그, 409 충돌 | 발급 회사·거래처 토큰 확인 후 `place_store_order` RPC. 단일 `resolve_price`와 `closed` 흐름은 미완료([G1](04_GAPS.md#g1)). |
| ConfirmSaleDocument | `POST /api/business-documents/[id]/actions`: action=confirm, companyId | `{document}`; 401 인증, 403 권한, 400 상태·DB 오류 | 현재 `manage_sales` → `confirm_business_document` RPC. 주문 출고 확정과 `customer_items` 갱신은 미연결([G2](04_GAPS.md#g2)). |
| CreatePurchaseVoucher | 현재 API 없음. 목표 입력: companyId, purchaseOrderId, received lines, idempotencyKey, 선택적 지급·기준 단가 반영 | 목표: 매입전표·원장·재고·발주 상태를 단일 결과로 반환 | 미구현([G3](04_GAPS.md#g3)). 승인된 발주 SQL 뒤에 RPC·API가 필요하다. |
| ApplyImport | `POST /api/product-catalog/imports`: action=save-import/confirm-conversion/create-standards, 파일·매입처·상품 행 | 가져오기 결과; 400 입력·상한, 401 인증, 403 권한, 404 플래그 | 현재 `manage_sales`와 회사별 PRICING 플래그. `import_jobs/import_rows` 원자 적용·되돌리기는 별도 단계([G4](04_GAPS.md#g4)). |
| RecordPayment | `POST /api/partner-ledger`: partnerType, partnerId, entryDate, amount, paymentMethod, idempotencyKey | `{entry}`; 400 입력·DB 오류, 401 인증, 403 권한 | 현재 `manage_sales` → `record_partner_payment` RPC. 예치금 잔액 잠금·0 미만 차단은 미구현([G5](04_GAPS.md#g5)). |

견적·단가표의 현재 경로는 `GET/POST /api/pricing-documents`, 링크 관리는 `/api/pricing-store-links`다. 기존 `sales_quotes` 수락 API에 새 `pricing_documents` ID를 전달하지 않는다([G6](04_GAPS.md#g6)).

응답의 세부 필드는 각 경로 타입과 테스트가 현재 근거다. 목표 API 구현 시 회사 ID와 멱등 키를 서버와 RPC 양쪽에서 검증한다.
