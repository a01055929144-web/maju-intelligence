# API와 Use Case 계약

기준: [백엔드 계약서](00_BACKEND_CONTRACT.md) 1·5절. 아래의 **현재**는 저장소 경로가 존재한다는 뜻이며, 계약의 원자성·멱등성까지 보증하지 않는다. 없는 경로는 구현 전 계획이다. 모든 내부 요청은 인증된 회사 `company_id`와 권한을 서버에서 확인한다.

| Use Case | 현재 경로 | 입력 → 출력 | 오류·권한 | 계약 상태 |
|---|---|---|---|---|
| `PlaceStoreOrder` | `POST/PATCH/PUT /api/storefront` | 링크 토큰, 배송일, 품목·수량, 요청 식별자 → 주문·줄·조회 결과 | 잘못된 입력 400, 다른 Origin 403, 만료·차단 링크 404. 매장 토큰 범위만 | P2 초안 의존; 계약 I-7·I-9 재검증 필요 |
| `ConfirmSaleDocument` | `POST /api/business-documents`, `POST /api/business-documents/[id]/actions` | 회사·전표·줄·확정 액션 → 전표 상태 | 미인증 401, `manage_sales` 부재 403, 상태·입력 오류 400 | 원장·재고는 기존 DB RPC/트리거, `customer_items` 갱신은 미확인 |
| `CreatePurchaseVoucher` | 같은 전표 API에서 매입 전표 수기 처리 | 공급처·줄·확정 액션 → 매입전표 | `manage_sales`; 다른 회사 ID 거부 | 발주 연결·부분 입고·기준 단가 반영은 미구현 |
| `ApplyImport` | `POST /api/product-catalog/imports` | 유통사·파일명·매핑한 행 → 가져오기 결과 | 로그인·회사·`manage_sales`, 행 수·가격 검증 400 | 기존 가져오기 흐름 있음. 새 `import_jobs/import_rows` 정본 전환 전 |
| `RecordPayment` | `POST /api/business-documents/[id]/actions`의 결제 관련 액션과 DB `record_partner_payment` | 거래처·금액·수단·멱등 키 → 원장 행 | 회사·권한·금액 확인 | 예치금 잔액 잠금은 미구현 |
| `ResolvePrice` | `GET/POST /api/price-sheets`, `GET/POST /api/pricing-documents`, `GET/POST /api/pricing-store-links` | 회사·거래처·상품·날짜·단위 → 가격·세금·출처·문서 버전 | 로그인·가격 권한·회사 플래그, 미허용 404 | 가격 결정 함수 하나로의 통합은 미완료 |
| `InventoryDocumentStatus` | `GET/POST /api/inventory/documents/[id]`, `GET /api/inventory` | 회사·전표/상품 → 반영 상태·현재고 | `manage_sales`·회사 격리 | 기존 재고 기능, 주문 예약 계산은 미구현 |

공개 매장 응답은 원가·마진·공급처를 포함하지 않는다. 구현 시 요청/응답의 정확한 필드와 DB RPC를 함께 고정한다. 새 API를 만들 때 이 표를 먼저 갱신한다.
