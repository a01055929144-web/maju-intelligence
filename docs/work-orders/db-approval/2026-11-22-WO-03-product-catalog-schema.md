# WO-03 상품 분류 스키마 — 운영 DB 승인 대기

- 적용: `docs/sql-drafts/20261102-WO-03-product-catalog-schema.sql`
- 복구: `docs/sql-drafts/20261102-WO-03-product-catalog-schema.down.sql`
- 상태: **미승인 · 운영 미적용**. 이 문서는 적용 권한이 아닙니다.

## 범위와 순서

CX-123 전체 상품 진열의 첫 선행 단계입니다. 기존 `product_catalog`에 nullable `category_id`를 추가하고, `product_categories` 테이블·트리 검증 트리거·회사 범위 외래 키·인덱스를 만듭니다. 기존 상품행·분류값은 채우지 않습니다. 새 테이블은 RLS를 켜고 `service_role`에만 권한을 줍니다. D4 S-3bc와 CX-123은 이 단계 뒤에 검증합니다.

## 적용 관문

- 대상 운영 프로젝트를 명시한 대표의 **WO-03 별도 승인**이 있어야 합니다. 다른 SQL·기능 ON·배포 승인을 포함하지 않습니다.
- 직전 읽기에서 분류 테이블·`category_id`·대상 인덱스·트리거가 없고, `product_catalog(company_id,id)` 유니크 키와 `product_code`가 있음을 확인합니다. 하나라도 달라지면 중단합니다.
- 격리 PostgreSQL 17에서 현행 운영 스키마와 함수·제약·권한을 대조하고 up → down을 다시 통과시킵니다. 운영 적용은 한 번만, 실패 시 부분 실행을 재시도하지 않습니다.

## 적용 뒤 읽기 검증

- 새 분류 테이블 0행, 기존 상품행의 `category_id`는 모두 NULL, 기존 상품행 수·가격·세금 구분 불변.
- 회사별 분류·부모 외래 키와 단계 검증, `anon`/`authenticated` 접근 금지·`service_role` 접근 허용.
- 기능 OFF. 다음 D4 적용 전에 상태 기록을 마칩니다.

## 되돌리기 제한

복구 SQL은 분류 테이블에 행이 있거나 상품에 `category_id`가 있으면 중단합니다. CX-123 소비 함수가 남아 있어도 중단하며, 다른 의존 객체가 있으면 PostgreSQL의 RESTRICT 실패로 트랜잭션 전체가 취소됩니다. 실데이터가 생긴 뒤 삭제·백필 없이 되돌리지 않습니다.

## PG17 근거

원본 WO-03 시험은 회사 간 분류 격리·단계/중복 검사·권한을 검증합니다. R17 폐기형 PG17 순차 시험은 WO-03 → D4 → CX-123 적용과 소비 함수 역순 제거, 기존 상품행 불변을 확인합니다.
