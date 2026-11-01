# ARC-03 거래처·ARC-07 전표/원장 경계 대조

> 기준: 2026-11-01 `main@fb7175e`, 미병합 작업지시서 PR #106  
> 범위: 실제 코드·저장소 migration·문서 대조. 운영 DB 변경, 기능 플래그 활성화, 배포 없음.  
> 상태: `확인됨 / 초안 / 보류 / 충돌`을 구분하며, PR #106이 병합되기 전까지 이 문서는 구현 기준 후보이다.

## 결론

- ARC-03은 리드와 거래처를 합치지 않는다. 영업 소유 `business_permit_leads`/`lead_actions`와 거래처 소유 `normalized_customers`를 회사 범위 `matched_customer_id`로 연결한다.
- ARC-07의 금액 원천은 `business_documents`/`business_document_lines`, 잔액 원천은 append-only `partner_ledger_entries`다. 입금·지급도 같은 원장 RPC만 쓴다.
- `sales_transactions`는 레거시 분석·수입 자료다. 미수금, 미지급금, 명세서, 세금계산서, 확정 매출/매입 합계에 자동 합치지 않는다.
- 현재 새 전표 저장은 코드 소유자는 한 곳이지만 헤더 INSERT와 라인 RPC가 분리돼 완전한 단일 트랜잭션이 아니다. 승인된 신규 RPC 전환 전에는 ARC-07 원자성 완료로 표시할 수 없다.

## 소유권과 쓰기 원천

| 업무 | 소유 모듈 | 현재 쓰기 원천 | 판정 |
|---|---|---|---|
| 리드 활동·전환 요청 | lead | `business_permit_leads`, `lead_actions`, `convertPermitLeadToCustomer` | **확인됨**. 05번 DNC 규칙을 재사용하고 DNC/활동 행을 customer로 복사하지 않는다. |
| 매출처 기본정보 | customer | `normalized_customers`, `upsertCustomerMaster` | **확인됨**. 리드 전환은 빈 기본정보만 이어받고 `matched_customer_id`를 남긴다. |
| 매입처 기본정보 | purchasing/product | `product_suppliers`, 전용 API/repository | **확인됨**. 매출처와 자동 병합하지 않고 `linked_customer_id`는 선택 연결이다. |
| 전표·라인 | erp | `business_documents`, `business_document_lines`, `lib/business-documents.ts` | **부분 확인**. 수정·확정·취소는 RPC 경계이나 신규 헤더 생성은 Data API와 RPC 두 단계다. |
| 원장 | erp | `partner_ledger_entries` | **확인됨**. 전표 RPC/trigger와 `record_partner_payment`만 append한다. 앱에서 기존 원장 행을 수정·삭제하지 않는다. |
| 입금·지급 | erp | `record_partner_payment` RPC | **보완됨**. 호출자 멱등키를 필수로 하며 서버가 누락 키를 임의 UUID로 바꾸지 않는다. |
| 과거 매출 업로드 | sales legacy | `sales_transactions` | **분리 확인**. 분석·매칭·이탈 신호에는 사용하지만 ERP 원장에는 자동 반영하지 않는다. |
| 주문→전표 | order → erp 계약 | 주문 확정 결과가 전표 생성 요청을 제공해야 함 | **보류**. PR #99는 draft·기능 OFF이며 확정 주문의 안정 ID와 원자 전표 생성 계약이 없다. |

## ARC-03 흐름과 05번 경계

1. 05번 리드 모듈이 회사 범위 리드, 중복 판정, DNC, 활동 원본을 소유한다.
2. 거래처 전환 직전에 같은 회사의 customer를 다시 검사한다.
3. 기존 거래처면 새 customer를 만들지 않고 `(company_id, matched_customer_id)`를 연결한다.
4. 신규 거래처면 customer 소유 진입점으로 기본정보를 만들고 lead에 생성된 ID를 연결한다.
5. `lead_actions`, DNC, 칸별 출처는 복사하지 않고 연결 조회한다. 원본 영업 기록의 ID·시각·회사 범위를 보존한다.

현재 `convertPermitLeadToCustomer`는 customer 생성, lead PATCH, 활동 INSERT, 수락 견적 반영을 여러 요청으로 수행한다. `20261029-lead-customer-continuity.sql`은 회사 복합 FK와 연결 조회 초안까지 제공하지만 앱 호출 경로에는 연결되지 않았다. 따라서 실패 재시도 전체가 아직 단일 원자 흐름은 아니며, 기능 플래그를 켤 근거가 아니다.

**미병합 PR #109와의 관계:** #109는 기존·신규 거래처 전환 모두에서 누락된 `convert` 활동을 재시도로 복구하는 ARC-03 구현을 추가한다. 이 문서의 리드/거래처 소유권과 일치하지만 같은 `convertPermitLeadToCustomer` 흐름을 다루므로, #109가 먼저 병합되면 이 문서의 “활동 INSERT” 판정은 “멱등 복구됨”으로 갱신해야 한다. 다만 customer 생성·lead 연결·활동 기록의 다중 요청과 DB 직렬화 미완료는 그대로 남는다. #111은 해당 코드를 중복 수정하지 않는다.

## ARC-07 실제 규칙과 문서 충돌

| 쟁점 | 오래된 문서 | 실제 코드/migration 판정 |
|---|---|---|
| 확정 전표 수정 | `business-document-erp-design-2026-10-16.md`: 확정 후 헤더·라인 불변 | **충돌 — ERP 1-B v2 우선.** 세금계산서 잠금 전에는 날짜·품목·금액·거래처 이동을 허용하고 `revision`과 event를 남긴다. |
| 원장 정정 | 확정/취소 외에는 불변으로 읽힐 수 있음 | 원장 행 자체는 계속 append-only다. 수정된 전표는 기존 행을 고치지 않고 차액/이동 `adjustment`를 추가한다. |
| 전표 삭제 | 초안 삭제, 확정 취소 | v2는 세금계산서 잠금 전 발행 전표 삭제/이동 경로를 추가했다. 현재 UI/API 노출 범위와 DB RPC를 구분해 검토해야 한다. |
| 전표 저장 원자성 | 확정 RPC 중심 설명 | 신규 저장은 헤더 Data API INSERT 후 `save_business_document` RPC다. 정리 DELETE가 있어도 완전한 단일 트랜잭션이 아니다. |
| 상품 소유권 | `docs/02_DOMAIN_MAP.md`가 `product_catalog`를 quote 소유로 기재 | **충돌.** 실제 상품/매입처 관리와 PR #106 기준은 product/purchasing 소유, quote/pricing은 읽는 쪽이다. ARC-01 문서 갱신 전까지 기존 표기를 최신 기준으로 사용하지 않는다. |
| 가격 우선순위 | 2026-10-15 문서는 계약→브랜드→업종→기준가 | 최신 가격/주문 와이어프레임은 직접 단가→품목 마진→그룹→회사 기본, 매장 계약 단가 최우선이다. ARC-05/06 결정 전 ERP가 가격을 재계산하지 않고 전표 스냅샷을 받는다. |

## 한 쓰기 원천 계약

1. API route는 인증·입력 검증만 하고 `lib/business-documents.ts`의 use-case를 호출한다.
2. 전표 상태, 원장, 재고가 함께 변하는 작업은 승인된 DB RPC/trigger 한 transaction이 소유한다.
3. `partner_ledger_entries` 직접 UPDATE/DELETE와 `sales_transactions`→원장 자동 변환은 금지한다.
4. 입금·지급 재시도는 같은 클라이언트 멱등키를 재사용한다. 키가 없으면 쓰기 전에 거부한다.
5. 조회 화면은 레거시 매출과 ERP 확정 전표를 합칠 수 있지만 출처·합계 열을 분리하고 ERP 잔액에는 레거시를 포함하지 않는다.

## 남은 작업과 승인 경계

- **ARC-03:** 전환 전체를 하나의 승인된 RPC/use-case로 묶고, 기존 거래처 연결·신규 생성·활동 기록·견적 후처리의 재시도 결과를 검증해야 한다.
- **ARC-03 / PR #109:** #109 병합 순서에 따라 문서 판정을 재대조한다. #109의 활동 이력 복구는 수용하되, 회사 복합 FK 초안 적용이나 전환 전체 원자성 완료로 확대 해석하지 않는다.
- **ARC-07:** `save_business_document_draft` 또는 동등한 신규 생성 RPC 초안이 필요하다. 헤더·번호·상대방 스냅샷·라인을 한 transaction에서 만들고 source idempotency를 강제해야 한다.
- **ARC-07:** v2의 발행 전표 수정·삭제를 UI에서 어디까지 허용할지 제품/회계 승인이 필요하다. 세금계산서 잠금 전이라도 권한·사유·감사 event를 검증해야 한다.
- **ARC-06/07:** 주문 확정의 안정 ID, 전표 `source_type/source_key`, 재시도 멱등 계약이 승인되기 전 주문→전표 자동 생성은 OFF다.
- **운영:** 신규 SQL, backfill, 기존 원장 재분류, `sales_transactions` 변환은 모두 별도 초안·검토·승인 대상이다.

이번 PR은 위 경계를 문서와 계약 테스트로 고정하고 입금·지급 멱등키 누락만 코드에서 차단한다. 운영 스키마나 기존 데이터는 변경하지 않는다.
