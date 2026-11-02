# Codex 작업지시서 — 지금 바로 쓰기 (2026-11-02 09:31 대표 지시 · 최우선)

**대표 지시: "지금 바로 사용할 수 있도록 하는 게 우선순위 제일 높다."**
대상 3가지: ① 견적서 · 단가표 ② 매입가 엑셀 업로드 ③ 링크 주문.

- 이 문서는 decisions-0824 3절의 순서보다 **먼저** 한다. 이 작업이 끝나면 그 순서로 돌아간다.
- **원칙: 지금 있는 화면과 코드로 오늘 쓰게 만든다.** v53 디자인 맞추기는 그다음이다.
  - 쓸 코드: P0 가격표·마진, P1 견적서·단가표 문서, P2 매장 링크·주문, 상품·가져오기.
  - 막는 것만 고친다. 새 기능과 리디자인은 하지 않는다.
- 범위: **대표 운영 회사 1곳**에서만 켠다(회사별 플래그).

## 0. 코드에서 확인된 막힌 지점 (Claude 확인, 09:40)

| # | 막힌 지점 | 근거 |
|---|---|---|
| 1 | 화면이 보류 경로 아래에 있다 | `/revenue/pricing`, `/revenue/pricing/documents`, `/revenue/pricing/links`, `/revenue/products`는 `HOLD_MODULE_PATH_PREFIXES`의 `/revenue`에 걸린다 |
| 2 | API가 보류 모듈 스위치로 막혀 있다 | `api/price-sheets` · `api/pricing-documents`(그리고 링크 API로 추정)가 `areHoldModulesEnabled(companyId)`를 확인한다. 이걸 켜면 `/assistant` · `/crm` · `/operations` 등 **다른 보류 모듈까지 같이 열린다** |
| 3 | 전체 플래그가 꺼져 있다 | `PRICE_SHEETS_ENABLED`, `STORE_ORDERING_ENABLED`(+ `STORE_LINK_SECRET` 32자 이상, `STORE_PUBLIC_BASE_URL` https 필요) |
| 4 | 운영 DB에 테이블이 없을 가능성이 크다 | P0(`pricing_settings` · `pricing_items` · `margin_groups` …), P1(`pricing_documents` …), P2(`storefront_links` · `store_orders` …)는 `docs/sql-drafts/20261030-pricing-*.sql` 초안이고, migrations에 없다. `product_catalog` · `product_suppliers` · `sales_quotes`는 migrations에 있다 |

## 1. 지금 할 일 (순서대로)

### U-1 막힘 점검표 (1시간 안에 보고)

- PG17에서 세 흐름을 끝까지 돌려 본다. DB 상태는 운영 스키마 스냅샷(`supabase/schema.sql` + `supabase/migrations`)에 초안을 적용한 것이다.
- 막히는 곳을 아래 표로 정리한다.

| 흐름 | 단계 | 막힘 | 원인 | 고칠 것 | DB 필요 |
|---|---|---|---|---|---|

- 운영 DB에 실제로 어떤 테이블이 있는지는 **읽기 전용 조회로만** 확인하고 표에 적는다. 쓰기는 하지 않는다.

### U-2 화면 · API 열기 (보류 모듈과 분리)

- 아래 경로를 `isHoldModulePath`의 예외로 둔다(`/revenue/contacts`처럼).
  - `/revenue/pricing`, `/revenue/pricing/documents`, `/revenue/pricing/links`, `/revenue/products`
- 위 경로와 관련 API의 `areHoldModulesEnabled` 확인을 **회사별 플래그**로 바꾼다(decisions-0824 P0-2의 `isFeatureEnabled`).
  - API: price-sheets, pricing-documents, pricing-store-links, pricing-order-settings, product-catalog/imports
  - 플래그: `isFeatureEnabled("PRICING", companyId)`, `isFeatureEnabled("STORE_ORDERING", companyId)`
  - 판단은 서버에서 한다.
- 매장 쪽 `/store` · `api/storefront`는 로그인 없이 링크 토큰으로 열린다. 링크를 발급한 회사의 플래그가 꺼져 있으면 404를 준다.
- 사이드바 "주문·단가" 묶음에 메뉴를 넣는다. 플래그가 켜진 회사에만 보인다.
  - 견적서·단가표 → `/revenue/pricing/documents`
  - 매입가 반영 · 마진 → `/revenue/pricing`
  - 링크 관리 → `/revenue/pricing/links`
  - 상품관리 → `/revenue/products`
- **`HOLD_MODULES_ENABLED_COMPANY_IDS`는 쓰지 않는다**(다른 보류 모듈이 열린다).
- 테스트: 플래그가 꺼진 회사는 화면 · API 모두 404, 켜진 회사는 200. 보류 경로(`/crm` 등)는 그대로 404.

### U-3 운영 DB 최소 묶음 → 승인 표 (`docs/work-orders/db-approval-queue.md`)

세 흐름에 **꼭 필요한 것만** 넣는다. 예상 묶음은 아래와 같고, U-1 결과로 확정한다.

| 순서 | 초안 | 필요한 흐름 | 비고 |
|---|---|---|---|
| 1 | `20261030-pricing-p0.sql` | ① ② 마진 그룹 · 기본가 다시 계산 | |
| 2 | `20261030-pricing-p1.sql` | ① 견적서 · 단가표 문서 · 버전 · 인쇄 | |
| 3 | `20261030-pricing-p2-store-ordering.sql` | ③ 링크 · 매장 주문 | `product_catalog`를 ALTER한다 → 기존 데이터 영향을 꼭 적는다 |
| 4 | `p2-onboarding-vault` · `p2-vault-access` | ③에 꼭 필요할 때만 | 필요 없으면 뒤로 미룬다. 이유를 적는다 |
| 5 | `WO-25-import-audit-schema` · `product-base-prices` | ②에 꼭 필요할 때만 | 지금 있는 상품 가져오기로 매입가 반영이 되면 뒤로 미룬다 |

- 표 칸: 객체 · 기존 데이터 영향 · down 파일 · PG17 테스트 결과 · 걸리는 시간 · 실패하면 어떻게 되는지.
- 묶음 적용 스크립트 초안: 순서대로 실행하고, 하나라도 실패하면 멈추고 되돌린다.
- 적용 직전에 할 것: 백업(스키마 + 관련 테이블 덤프)을 하고, RLS 정책을 확인한다.
- **표를 올리고 멈춘다.** Claude가 검토한다 → 대표가 승인 문구(`fcmdvveqmcgtioelzqun` 명시)를 준다 → 07:30~23:00 사이에 적용한다.
  - 적용 PR에는 `DB-APPROVED:` 줄을 넣고 migrations 파일을 추가한다.

### U-4 켜기 (대표가 Vercel에서 직접)

Codex는 **이름과 설명만** 표로 준다. 값(특히 비밀값)은 채팅 · PR · 로그에 쓰지 않는다.

| env | 값 | 누가 |
|---|---|---|
| `PRICE_SHEETS_ENABLED` | `true` | 대표 |
| `FEATURE_PRICING_COMPANY_IDS` | 대표 운영 회사 id | 대표 (Codex는 관리자 화면에서 id 찾는 법만 안내) |
| `STORE_ORDERING_ENABLED` | `true` | 대표 |
| `FEATURE_STORE_ORDERING_COMPANY_IDS` | 대표 운영 회사 id | 대표 |
| `STORE_LINK_SECRET` | 32자 이상 임의 문자열 | **대표가 직접 생성 · 입력** (채팅에 붙여넣지 않음) |
| `STORE_PUBLIC_BASE_URL` | 운영 도메인 https 주소 | 대표 |

- 끄기: 회사 id를 지우거나 `*_ENABLED=false`로 바꾼다. 재배포하면 바로 꺼진다. DB down은 정말 필요할 때만 쓴다.

### U-5 운영 확인 체크리스트 (켠 뒤 대표가 직접, 10분)

**① 견적서 · 단가표**
1. 마진 그룹 1개 만들기
2. 단가표 만들기 → 품목 5개 → 인쇄 · PDF
3. 견적서 만들기 → 공유 링크 → 수락
4. 매장에 단가표 연결

**② 매입가 엑셀**
1. 매입가 엑셀 올리기
2. 열 맞추기(ERP 코드 · 상품명 · 규격 · 단위 · 매입가)
3. 미리보기 → 반영
4. 기본가 다시 계산
5. 단가표에 바뀐 값이 나오는지(새 버전)

**③ 링크 주문**
1. 매장 링크 발급
2. 폰에서 열기
3. 품목 · 가격 확인(협의 > 견적 > 단가표 > 기본가)
4. 주문
5. 고객사 화면에 주문이 보이는지
6. 링크 끄기 → 다시 열면 막히는지

Codex는 같은 체크리스트를 **프리뷰 배포 + 테스트 회사**로 먼저 끝까지 돌리고, 스크린샷을 PR에 넣는다.

## 2. 오늘 하지 않는 것

- v53 디자인 맞추기, 출고 준비 · 발주, 전표 · 예치금 · 지급, 재고 원장.
- 2% 수수료 수금, 참고 단가 칸 이름 확정(보류).
- 보류 모듈 열기.

## 3. 보고 (단계마다 짧게)

- U-1 점검표
- U-2 PR 번호와 테스트 결과
- U-3 승인 표 링크 (→ Claude 검토 요청)
- U-4 env 이름 표
- 프리뷰 체크리스트 결과(스크린샷)
