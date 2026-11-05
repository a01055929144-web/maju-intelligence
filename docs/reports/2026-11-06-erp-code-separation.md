# 고객사 ERP 코드와 MAJU 내부 P-코드 분리 조사

## 결론

- `product_catalog.product_code`는 MAJU 내부 코드다. `next_product_code()`가 회사별로 `P-000001` 형식을 발급하고, 트리거가 변경을 막는다. 삭제·재사용하지 않는다.
- 고객사 ERP 코드는 `product_catalog.erp_code`에 별도 저장한다. 값이 없으면 `null`로 둔다. MAJU P-코드로 채우지 않는다.
- `supplier_products.supplier_code`는 매입처별 품번이다. 고객사 ERP 코드와 같은 값일 수 있어도 의미와 중복 범위가 다르므로 이름을 바꾸거나 일괄 복사하지 않는다.

## 현재 흐름과 혼선

1. 상품 마스터 생성 시 `lib/product-catalog-import.ts`가 `next_product_code()`를 호출해 `product_catalog.product_code`를 만든다.
2. 업로드의 `productCode`는 `domains/product/catalog-import.ts`에서 `supplier_products.supplier_code`로 저장된다.
3. 매입가 업로드는 `supplier_code`를 우선 비교하므로 기존 매입처 연결은 동작한다.
4. `docs/sql-drafts/20261102-WO-03-product-catalog-schema.sql`은 기존 `product_code`를 ERP 코드로 재사용한다고 적어 실제 DB 의미와 충돌한다.
5. 견적·단가표·재고의 `product_code_snapshot`과 검색은 현재 내부 P-코드를 사용한다. 이 보고 범위에서는 바꾸지 않는다.

## 정식 저장 규칙

| 값 | 저장 위치 | 비어 있음 | 중복 범위 | 변경 |
|---|---|---:|---|---|
| MAJU 내부 P-코드 | `product_catalog.product_code` | 불가(기존 발급 흐름 유지) | 회사별 유일 | 변경 금지 |
| 고객사 ERP 코드 | `product_catalog.erp_code` | 허용, `null` 저장 | 회사별·대소문자/앞뒤 공백 무시 유일 | 관리자 검토 후 변경 가능 |
| 매입처 품번 | `supplier_products.supplier_code` | 허용 | 회사+매입처별 유일 | 다음 업로드로 갱신 가능 |

빈 문자열은 저장하지 않고 `nullif(btrim(value), '')`로 `null` 처리한다. ERP 코드의 길이는 1~80자다.

## 업로드·연결 영향

- 기존 `supplier_code → 이름+규격` 매칭은 그대로 보존한다. 새 컬럼 추가만으로 기존 연결이 끊기지 않는다.
- 고객사 ERP 코드가 명시된 상품 마스터 업로드에서는 `erp_code`를 먼저 비교하고, 없을 때만 기존 바코드·매입처 품번·이름/규격/단위 순서를 사용해야 한다.
- 매입처 파일의 “상품코드/품목코드”는 계속 `supplier_code`다. 같은 열을 ERP 코드와 매입처 품번 양쪽에 자동 저장하면 잘못된 회사 마스터 연결이 생기므로 금지한다.
- 기존 견적·단가표·재고·문서 snapshot은 내부 P-코드를 계속 사용한다. 고객사 ERP 코드를 표시·검색하려면 각 소유 화면/API가 별도 전환해야 하며 이번 범위 밖이다.

## 기존 데이터 마이그레이션 예상

- 안전한 자동 이관: **0건**. 현재 `product_catalog.product_code`는 내부 P-코드이므로 ERP 코드로 복사할 수 없다.
- 컬럼 추가 후 기존 `product_catalog`의 `erp_code`: **전 행 null**.
- 현재 알려진 매입처 원가 행 약 741건은 `supplier_products` 행 수이며 ERP 코드 이관 건수가 아니다. 하나의 상품에 여러 매입처 품번이 연결될 수 있어 741건을 자동 이관하면 안 된다.
- 검토 후보 수는 SQL 초안의 진단 쿼리로 계산한다. 한 상품에 연결된 비어 있지 않은 `supplier_code`가 정확히 하나뿐인 경우만 후보이며, 그래도 사람 승인 전에는 쓰지 않는다.

## 경계와 후속

- 이 작업은 SQL 초안과 조사 보고만 제공한다. 운영 DB는 변경하지 않았다.
- `lib/customer-navigation.ts`, 상품관리 화면, 매입가 화면, 문서 화면은 수정하지 않았다.
- UI/API 전환 시 상품관리·문서·재고 소유자가 `product_code`를 내부 코드로 명시하고 `erp_code` 표시·검색을 별도로 추가해야 한다.
- 기존 WO-03 SQL 초안의 “`product_code`를 ERP 코드로 재사용” 문구는 해당 초안 소유자와 합의 후 교체해야 한다.

