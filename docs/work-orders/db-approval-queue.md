# 오늘 사용을 위한 DB 승인 대기표 (2026-11-02)

**상태: P0→P1→P2 운영 적용 완료(2026-11-02). 재실행 금지.**
대표가 프로젝트 `fcmdvveqmcgtioelzqun`에 세 SQL을 순서대로 적용하도록 승인했다. 각 단계 적용 직후 테이블·RLS·클라이언트 권한을 읽기 검증했다. 기존 상품 업로드 테이블은 추가하지 않았고, 대표가 신규 상품 데이터를 직접 업로드한다.

| 순서·흐름 | 초안과 생성 객체 | 기존 데이터 영향 | down 파일 | PG17 결과 | 예상 소요 | 실패 시 조치 |
|---|---|---|---|---|---|---|
| 1 · 단가 재계산 | [`20261030-pricing-p0.sql`](../sql-drafts/20261030-pricing-p0.sql): `margin_groups`, `margin_group_categories`, `pricing_settings`, `pricing_items`, `price_recalc_runs`, `price_recalc_changes`, 계산 뷰·함수 | 기존 행 갱신 없음. 기존 `product_catalog.purchase_price`를 재계산 시 읽음 | [`20261102-usable-now-pricing-down.sql`](../sql-drafts/20261102-usable-now-pricing-down.sql), P0 구간 | PG17 스키마 적용 통과. 화면·데이터 흐름 검증 중 | 수 분 추정, 실측 전 | 이 파일의 트랜잭션 실패 시 해당 단계 롤백. 이후 단계 중단 |
| 2 · 견적서·단가표 | [`20261030-pricing-p1.sql`](../sql-drafts/20261030-pricing-p1.sql): `pricing_documents`, `pricing_document_versions`, `pricing_promotions`, `pricing_product_sets`, `pricing_print_profiles`, 버전 불변 트리거·함수 | 기존 견적·상품 행 백필/변경 없음. 새 문서부터 저장 | 같은 down 파일, P1 구간 | PG17 스키마 적용 통과. 화면·데이터 흐름 검증 중 | 수 분 추정, 실측 전 | 해당 단계 실패 시 롤백·중단. P0는 별도 커밋이므로 필요하면 백업 기반 복구 |
| 3 · 매장 링크 주문 | [`20261030-pricing-p2-store-ordering.sql`](../sql-drafts/20261030-pricing-p2-store-ordering.sql): 주문 설정·규칙·휴일, 링크·조회 이력, 주문·라인·요청·품목 선호 10개 테이블, 발급·주문·조회 함수 | `product_catalog.order_pricing_mode`가 `fixed` 기본값으로 추가됨. 기존 품목은 고정가로 취급, 기존 가격 자체는 변경 없음. `pricing_document_versions` 복합 고유 인덱스 추가 | 같은 down 파일, P2 구간. 주문이 생긴 뒤에는 파괴적 down 금지 | PG17 스키마 적용 통과. 화면·데이터 흐름 검증 중 | 수 분 추정, 실측 전 | 플래그 OFF·발급 중단. 실제 주문 발생 뒤에는 데이터 보존 후 수정 SQL로 복구 |

적용 전 운영 읽기 조회에서 위 신규 객체는 모두 **없음**을 확인했다. 대표 회사에는 거래처 27곳, 표준 상품·매입처 상품·견적은 각 0건이다. 적용 후 P0 테이블 6개, P1 테이블 5개, P2 테이블 10개가 생겼으며 모두 RLS 활성·일반 클라이언트 권한 없음으로 확인했다.
PG17 적용은 저장소 스키마 스냅샷에 운영에는 이미 존재하는 `normalized_customers(company_id,id)` 고유 제약을 진단용으로 보충한 **폐기 가능한 로컬 DB**에서 수행했다. 이 보충은 운영 SQL 변경 요청이 아니다.
PG17 링크 주문의 열기·주문·수정·재주문·회수 흐름은 통과했다. P2 링크는 새 `pricing_document_versions`의 견적도 공유할 수 있지만, 이 문서의 수락을 기존 `sales_quotes` 수락 API에 연결하는 코드는 확인되지 않았다. 대표 사용 체크리스트의 “견적 공유→수락”은 별도 연결 방식 검토 전까지 **미완료**다.
구체적으로 P1 `pricing_documents`에는 거래처 ID·수락 상태가 없고, P2 `storefront_links`는 주문 링크이며 수락 기록을 만들지 않는다. 기존 `POST /api/sales-quotes/[id]/accept`는 `sales_quotes`만 받는다. 따라서 새 가격 문서를 기존 수락 API에 ID만 전달하는 방식은 사용할 수 없다. 운영 첫날 수락이 필요하면 기존 `sales_quotes` 공유·직원 수락 흐름을 별도로 사용해야 한다. 새 문서의 수락·계약 단가 반영은 거래처 연결과 멱등 수락 RPC를 설계·승인받은 다음 구현한다. 이 추가 SQL은 아래 P0~P2 **최소 적용 승인 범위에 포함되지 않는다**.
down 초안도 폐기 가능한 PG17 복제 DB에서 실행·검증했다. P0/P1/P2 명시 객체와 함수가 제거되고 기존 테이블은 보존됐다. 이번 묶음에서 제외한 onboarding/vault 객체는 그대로 남는다.
공개 링크는 `/store#토큰` 형식이다. 첫 HTML 요청은 토큰이 서버에 전달되지 않아 회사별 HTTP 404를 만들 수 없다. 토큰을 제출하는 API는 발급 회사 플래그가 꺼져 있으면 404로 막고, 회사 자료를 읽지 않는다.

## 이번 묶음에서 제외

| 초안 | 판단 |
|---|---|
| `20261030-pricing-p2-onboarding-vault.sql`, `20261030-pricing-p2-vault-access.sql` | 링크 주문의 후결제 첫 사용에는 필요하지 않다. 고객 인증·금고는 이번 범위 밖. |
| WO-25 가져오기 감사, `product-base-prices` | 현재 업로드가 `product_suppliers`·`supplier_products`·원가 이력에 저장되고, P0는 `product_catalog.purchase_price`로 계산한다. 첫 파일에서 표준 품목 생성·연결을 확인하는 기존 화면을 쓴다. |

## 적용 전 점검과 순서 (이력)

1. 대표 회사의 상품·매입처 상품·견적은 0건, 거래처는 27건임을 확인했다. 거래처 전체 덤프는 개인정보 반출 위험으로 자동 승인 검토가 거절했고, 대표가 스키마·건수 확인과 PG17 복구 검증으로 대체하도록 별도 승인했다.
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

기능 플래그는 대표의 값 설정과 배포 확인 전까지 계속 OFF다. `HOLD_MODULES_ENABLED_COMPANY_IDS`는 사용하지 않는다.
`PRICING`·`STORE_ORDERING`과 기존 로그인·상품 가져오기 플래그는 공통 판정 함수에 연결했다. 관리자 시스템 화면에서 회사별 상태를 읽을 수 있다. 로그인은 회사가 결정되기 전의 인증 진입점이므로 기존 전체 OFF 스위치를 유지한다. 재고·기준 단가는 아직 회사별 활성화 경로가 없어 별도 단계에서 연결한다. 대표 승인 전에는 어떤 플래그도 새로 켜지 않는다.

## 백엔드 계약서 후속 묶음 (이번 최소 DB 승인 범위 밖)

| 순서 | 계약 규칙 | 필요한 초안·확인 | 상태 |
|---|---|---|---|
| B | I-1 · I-11 | 상품 단위 환산과 `product_base_prices`의 회사 복합 FK·날짜 유일성 | 별도 SQL 검토 대기 |
| D 최소 | I-2 · I-5 · I-7 | 기존 `business_documents`·`partner_ledger_entries`를 사용해 매출전표와 입금의 원자성 확인 | 별도 SQL 검토 대기 |
| E | I-4 · I-9 | 단일 가격 결정 함수, 링크 주문 회사 범위·토큰 검증, `store_orders.closed` | 별도 SQL 검토 대기 |
| F · 재고 | I-3 · I-8 | `purchase_orders`와 발주당 매입전표 1건, 출고 예정 계산 뷰 | 별도 SQL 검토 대기 |
| D 나머지 | I-6 | 기존 `partner_ledger_entries`의 예치금 유형과 0 미만 방지 | 별도 SQL 검토 대기 |

이 표는 미래 작업 순서만 기록한다. 이번 승인 요청은 위 1~3번 P0/P1/P2 초안에 한정한다.
