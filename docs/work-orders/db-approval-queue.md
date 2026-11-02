# 오늘 사용을 위한 DB 승인 대기표 (2026-11-02)

**상태: 승인 대기. 운영 DB에는 읽기 조회만 했으며 아래 SQL은 실행하지 않았다.**
Claude 검토 후 대표가 프로젝트 `fcmdvveqmcgtioelzqun`을 명시해 승인해야 한다. 기존 상품 업로드 테이블은 운영에 있으므로 추가하지 않는다.

| 순서·흐름 | 초안과 생성 객체 | 기존 데이터 영향 | down 파일 | PG17 결과 | 예상 소요 | 실패 시 조치 |
|---|---|---|---|---|---|---|
| 1 · 단가 재계산 | [`20261030-pricing-p0.sql`](../sql-drafts/20261030-pricing-p0.sql): `margin_groups`, `margin_group_categories`, `pricing_settings`, `pricing_items`, `price_recalc_runs`, `price_recalc_changes`, 계산 뷰·함수 | 기존 행 갱신 없음. 기존 `product_catalog.purchase_price`를 재계산 시 읽음 | [`20261102-usable-now-pricing-down.sql`](../sql-drafts/20261102-usable-now-pricing-down.sql), P0 구간 | PG17 스키마 적용 통과. 화면·데이터 흐름 검증 중 | 수 분 추정, 실측 전 | 이 파일의 트랜잭션 실패 시 해당 단계 롤백. 이후 단계 중단 |
| 2 · 견적서·단가표 | [`20261030-pricing-p1.sql`](../sql-drafts/20261030-pricing-p1.sql): `pricing_documents`, `pricing_document_versions`, `pricing_promotions`, `pricing_product_sets`, `pricing_print_profiles`, 버전 불변 트리거·함수 | 기존 견적·상품 행 백필/변경 없음. 새 문서부터 저장 | 같은 down 파일, P1 구간 | PG17 스키마 적용 통과. 화면·데이터 흐름 검증 중 | 수 분 추정, 실측 전 | 해당 단계 실패 시 롤백·중단. P0는 별도 커밋이므로 필요하면 백업 기반 복구 |
| 3 · 매장 링크 주문 | [`20261030-pricing-p2-store-ordering.sql`](../sql-drafts/20261030-pricing-p2-store-ordering.sql): 주문 설정·규칙·휴일, 링크·조회 이력, 주문·라인·요청·품목 선호 10개 테이블, 발급·주문·조회 함수 | `product_catalog.order_pricing_mode`가 `fixed` 기본값으로 추가됨. 기존 품목은 고정가로 취급, 기존 가격 자체는 변경 없음. `pricing_document_versions` 복합 고유 인덱스 추가 | 같은 down 파일, P2 구간. 주문이 생긴 뒤에는 파괴적 down 금지 | PG17 스키마 적용 통과. 화면·데이터 흐름 검증 중 | 수 분 추정, 실측 전 | 플래그 OFF·발급 중단. 실제 주문 발생 뒤에는 데이터 보존 후 수정 SQL로 복구 |

운영 읽기 조회에서 위 신규 객체는 모두 **없음**을 확인했다. 대표 회사에는 거래처 27곳, 표준 상품·매입처 상품·견적은 각 0건이다.
PG17 적용은 저장소 스키마 스냅샷에 운영에는 이미 존재하는 `normalized_customers(company_id,id)` 고유 제약을 진단용으로 보충한 **폐기 가능한 로컬 DB**에서 수행했다. 이 보충은 운영 SQL 변경 요청이 아니다.
PG17 링크 주문의 열기·주문·수정·재주문·회수 흐름은 통과했다. 새 `pricing_documents` 견적의 공유·수락이 기존 `sales_quotes` 수락과 이어지는지는 별도 확인 중이며, 확인 전에는 대표 사용 체크리스트의 “견적 공유→수락”을 완료로 보지 않는다.

## 이번 묶음에서 제외

| 초안 | 판단 |
|---|---|
| `20261030-pricing-p2-onboarding-vault.sql`, `20261030-pricing-p2-vault-access.sql` | 링크 주문의 후결제 첫 사용에는 필요하지 않다. 고객 인증·금고는 이번 범위 밖. |
| WO-25 가져오기 감사, `product-base-prices` | 현재 업로드가 `product_suppliers`·`supplier_products`·원가 이력에 저장되고, P0는 `product_catalog.purchase_price`로 계산한다. 첫 파일에서 표준 품목 생성·연결을 확인하는 기존 화면을 쓴다. |

## 적용 전 점검과 순서 초안 (실행 금지)

1. 운영 스키마와 관련 테이블을 별도 백업한다. `product_catalog`, 기존 상품·견적, 회사/거래처 테이블 덤프를 포함한다.
2. 객체 부재, `(company_id,id)` 참조 제약, 서비스 역할 권한과 기존 RLS를 확인한다. P0/P1은 **재실행 안전 SQL이 아니므로** 하나라도 존재하면 중단한다.
3. 파일 1 → 2 → 3 순서로 각각 오류 시 즉시 중단하는 세션에서 실행한다. 각 파일은 자체 `begin`/`commit`을 가지므로 전체 묶음은 단일 트랜잭션이 아니다.
4. 단계마다 객체·제약·RLS·`anon/authenticated` 권한 회수를 읽기 검증한다. 한 단계가 실패하면 다음 단계는 실행하지 않는다.
5. 실제 가격 문서나 주문이 생기기 전의 복구만 down 초안으로 검토한다. 운영 사용 후에는 플래그를 끄고, 보존한 데이터를 바탕으로 별도 복구 SQL을 승인받는다.

## 환경변수 이름 (값은 대표가 직접 입력)

| 이름 | 용도 |
|---|---|
| `PRICE_SHEETS_ENABLED` | 가격 기능 전체 준비 스위치 |
| `FEATURE_PRICING_COMPANY_IDS` | 가격 기능을 허용할 회사 목록 |
| `STORE_ORDERING_ENABLED` | 링크 주문 준비 스위치 |
| `FEATURE_STORE_ORDERING_COMPANY_IDS` | 링크 주문을 허용할 회사 목록 |
| `STORE_LINK_SECRET` | 공개 링크 서명 비밀값 |
| `STORE_PUBLIC_BASE_URL` | 공개 링크 기준 주소 |

운영 DB 승인 전에는 기능 플래그를 켜지 않는다. `HOLD_MODULES_ENABLED_COMPANY_IDS`는 사용하지 않는다.
