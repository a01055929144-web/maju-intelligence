# 권한 계약

기준: [계약서 9절](00_BACKEND_CONTRACT.md). 표의 **목표**는 새 ERP 흐름의 권한이며, 지금 적용된 권한은 아래 별도 문단에 적는다. 모든 내부 테이블은 회사별 복합 FK와 서버 범위 검증이 필요하다. 앱은 service_role로 DB에 접근하므로 RLS만으로 API 권한이 완성되지는 않는다.

| 역할 | 상품·주문 | 전표·원장 | 예치금·지급 | 매장 링크 | 회사·직원 설정 |
|---|---|---|---|---|---|
| 대표 | 관리 | 관리 | 관리 | 발급·회수 | 관리 |
| 경리 | 조회 | 작성·확정 | 등록·조회 | 조회 | 없음 |
| 영업·운영 직원 | 관리 | 주문 연계·조회 | 조회만 | 발급은 별도 권한 확인 | 없음 |
| 배송기사 | 배송 업무만 | 배송 관련 조회만 | 없음 | 없음 | 없음 |
| 매장 | 자기 품목·주문 | 자기 거래 명세만 | 노출 금지 | 자기 유효 토큰 | 없음 |

| 테이블/API 경계 | 서버 확인 | DB 확인 |
|---|---|---|
| `product_catalog`, `supplier_products`, `pricing_documents`, `/api/pricing-documents` | 인증 + 회사 플래그 + 상품/영업 권한 | 회사 범위, 복합 FK, service_role 전용 |
| `storefront_links`, `store_orders`, `/api/storefront` | 유효한 서명 토큰 + 발급 회사 플래그 + 거래처 범위 | 토큰 회사·거래처, 주문 멱등 키, service_role 전용 |
| `business_documents`, `business_document_lines`, `/api/business-documents/*` | 인증 + 회사 범위 + 전표 권한 | confirm/cancel RPC, 상태 전환 가드, 복합 FK |
| `partner_ledger_entries`, `/api/partner-ledger` | 인증 + 회사 범위 + 돈 권한 | append-only, 지급 RPC, 멱등 키 |
| `inventory_movements`, `inventory_balances` | 직원의 승인된 업무만 | 전표 트리거, 서비스 역할 전용, 회사 범위 |

**현재 코드와 차이:** `lib/workspace.ts`의 `manage_sales`는 driver/member/temporary에도 열려 있고, `/api/business-documents/*` 및 `/api/partner-ledger`는 이를 사용한다. 계약의 경리·기사·돈 조회/수정 분리는 아직 구현되지 않았다([G7](04_GAPS.md#g7)). 새 역할 전환 전에는 표의 목표 권한을 현재 운영 권한이라고 표시하지 않는다. 가격 문서 API는 owner/manager와 sales를 별도로 허용하고, 공개 매장 API는 직원 세션 대신 토큰을 확인한다.
