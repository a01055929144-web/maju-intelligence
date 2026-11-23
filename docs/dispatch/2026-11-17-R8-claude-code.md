# R8 작업지시 — Claude Code (2026-11-17 16:1x 작성, R7 다음)

규칙은 R2 · R4 그대로입니다. R7(CC-72 #1003 끝 · CC-70 · CC-68 · CC-69 후속)은 이어서 진행합니다.

**대표 지적 (11/17 15:59)**: "매입처/매출처 화면 통일화시켜야 하는데 현재 그 구조가 아님"

**지금 구조 (컨트롤타워 확인)**

| 구분 | 매출처 | 매입처 |
| --- | --- | --- |
| 메뉴 · 주소 | "매출처" `/crm/timeline` | "매입처" `/purchasing/suppliers` |
| 화면 컴포넌트 | 큰 CRM 화면(`app/crm/timeline/page.tsx` + `components/customers/sales-partner-panels.tsx`) | `components/product-supplier-workspace.tsx` |
| 공통 | `ErpPartnerDirectoryToolbar`만 같이 씀 | |
| 필드 · 표 · 상세 탭 | 서로 다름 | 서로 다름 |
| 데이터 | `normalized_customers` | `product_suppliers` |
| 원장 | `getPartnerLedger(partnerType)` | `getPartnerLedger(partnerType)` |
| 전표 | `business_documents.customer_id` | `business_documents.supplier_id` |

| 순서 | 작업 | 할 것 | DB | 완료 기준 |
| --- | --- | --- | --- | --- |
| 1 | **CC-73 거래처 화면 하나의 틀(매출처 · 매입처)** — CC-70과 합쳐 진행 | 아래 상세 | 매입처 쪽 칸이 더 필요하면 03에 초안 요청(SQL은 03 소유) | 1440 · 390 캡처: 두 화면이 같은 틀. e2e: 매출처 · 매입처 각각 목록 → 상세 → 전표 → 원장 |

## CC-73 상세
1. **공용 거래처 틀** `components/partners/partner-directory.tsx`(새로 만듦)
   - 왼쪽은 목록(공용 표), 오른쪽은 상세입니다. 매출처와 매입처가 같은 틀에 `partnerType="customer" | "supplier"`만 바꿔 씁니다.
   - 목록 열(공통): 표시 상호 · 사업자 상호 · 사업자번호 · 종사업장 · 대표자 · 연락처 · 최근 거래일 · 이번 달 거래액 · 미수금(매출처) / 미지급금(매입처) · 상태
   - 열 편집은 공용 표 그대로 씁니다. 매출처만 있는 열(등급 · 영업 단계 · 지도)은 매출처에서만 기본으로 보입니다.
   - 상세 탭(공통 순서): **기본 정보 · 품목/단가 · 전표 · 원장 · 메모**
     - 매출처 품목/단가 = 거래처별 최근 단가
     - 매입처 품목/단가 = 매입처 상품 · 확정 원가 · 원가 이력
   - 맨 위 버튼(공통): **[+ 등록] · [엑셀 올리기] · [전표 쓰기]**. 전표 쓰기는 `/operations/documents`에 그 거래처를 미리 골라 둔 채 엽니다.
2. **기본 정보 칸 통일**: CC-70 칸(매장/표시 상호 · 사업자 상호 · 사업자번호 · 종사업장번호 · 개인/법인 · 법인등록번호 · 대표자)을 매입처 등록 · 수정에도 같은 컴포넌트로 씁니다.
   - 매입처 테이블(`product_suppliers`)에 칸이 없으면 03에 SQL 초안을 요청합니다. CX-58과 같은 이름 · 같은 체크로 합니다. 그 전에는 매입처 쪽 새 칸은 숨깁니다.
3. 기존 화면은 지우지 않고 틀 안으로 옮깁니다(Strangler).
   - 매출처의 영업 기능(타임라인 · 지도 · 영업 단계)은 매출처 상세의 추가 탭으로 남깁니다.
   - 메뉴 이름 · 주소는 그대로 둡니다(대표가 익숙함).
4. Owner Domain: customer(매출처) · pricing/supplier(매입처). 공용 틀은 UI만 맡고, 비즈니스 규칙은 각 domain에 둡니다.

**CC-70(매출처 사업자 정보)은 CC-73 안에서 함께 처리합니다.** 순서는 바뀌지 않습니다: Codex 03 CX-59 병합 뒤 저장 연결.
