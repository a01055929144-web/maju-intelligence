# 전표 기반 ERP 문서·조회 설계 (2026-10-16)

> 설계 전용 문서입니다. 구현하거나 운영 DB에 적용하지 않습니다. 1단계 SQL 초안은 `docs/sql-drafts/erp-phase-1-documents-ledger.sql`입니다.

## 1. 결정: 공통 전표

`business_documents`와 `business_document_lines`를 매출·매입의 단일 거래 원천으로 사용한다. 거래명세서, 거래처원장, 세금계산서 대상 집계와 리포트는 확정 전표와 그 원장 항목에서 파생하며 별도 금액 공식을 두지 않는다.

- 유형: `sale`, `purchase`, `sale_return`, `purchase_return`
- 상태: `draft`, `confirmed`, `cancelled`
- 거래일: KST 업무일인 `document_date`
- 금액: 전표와 반품 모두 양수로 저장하고 원장 부호는 유형으로 결정
- 상대방: 매출·매출반품은 거래처, 매입·매입반품은 매입처만 허용
- 모든 회사 데이터 참조는 `(company_id, id)` 복합 FK로 격리

## 2. 전표와 라인

### 전표 헤더

- 회사·유형·연도별 원자 채번: `S-2026-000001`, `P-2026-000001`, `SR-...`, `PR-...`
- 번호, `company_id`, `document_type`은 초안에서도 불변
- 출처는 `manual`, `order`, `quote`, `upload`, `legacy_import`; 멱등은 회사·출처·`source_key` UNIQUE만 사용한다. 견적 1건이 여러 납품 전표를 만들 수 있으므로 `source_id`는 UNIQUE가 아니다.
- `original_document_id`는 반품의 원전표를 선택 연결한다. 같은 회사 전표만 참조한다.
- 확정 RPC가 라인 금액을 합산하고 전표 상태와 원장 항목을 한 트랜잭션에서 기록한다.
- 전표번호 연도와 `document_date` 연도가 다르면 확정을 거부한다.

### 전표 라인

- 회사 상품 또는 매입처 상품을 선택 연결하며, 품목코드·명·규격·단위·과세구분은 스냅샷으로 고정한다.
- `company_id`, `document_id`는 초안에서도 변경할 수 없다.
- `공급가액 = round(수량 × 단가)`, 과세 부가세는 줄별로 `round(공급가액 × 10%)`, 면세는 0이다.
- 확정 후 헤더와 라인은 수정·삭제할 수 없다.
- 계약 단가는 매출 초안의 기본값일 뿐이며 전표에는 당시 단가를 스냅샷으로 저장한다.

## 3. 확정·취소·반품

`confirm_business_document`는 초안을 잠그고 라인 존재 여부, 번호 연도, 합계를 검증한 다음 확정과 원장 INSERT를 원자 처리한다.

취소는 새 전표를 만들지 않는다. `cancel_business_document`만 다음을 수행한다.

1. 확정 전표를 `cancelled`로 전환하고 취소 담당자·시각만 기록
2. 원장에 기존 확정 항목의 반대 금액인 `reversal` 한 건을 `document:{id}:cancel` 멱등 키로 추가
3. 기존 전표·라인과 확정 원장 항목은 그대로 보존

불변 트리거는 confirmed→cancelled 전환에서 `status`, `cancelled_by_user_id`, `cancelled_by_name`, `cancelled_at`, `updated_at`만 달라지는 경우를 허용한다. 반품은 취소가 아니라 `sale_return`/`purchase_return` 전표이며 `original_document_id`로 원전표를 연결한다.

## 4. 거래처·매입처 원장

`partner_ledger_entries`는 append-only다.

- 양수: `sale`, `purchase`
- 음수: `receipt`, `payment`, `sale_return`, `purchase_return`
- 0이 아닌 양·음수: `adjustment`, `reversal`
- 전표 확정 시 `document:{id}:confirm`, 취소 시 `document:{id}:cancel`, 입금·지급은 호출자가 제공한 멱등 키를 사용한다.
- 잔액은 원장 금액 합계로 계산하며 별도 잔액 컬럼을 저장하지 않는다.

1단계 거래처원장은 기간 시작 전 합계를 기초잔액으로, 기간 내 전표·입금 흐름과 누계를 표시한다. 발행 스냅샷은 2단계 이후다.

## 5. 거래처 병합 정책

1차에서는 전표, 원장 또는 원장 발행본이 하나라도 연결된 중복 거래처의 병합을 사전 차단하고 “거래 문서가 있는 거래처는 병합할 수 없습니다”라고 안내한다. FK 오류가 난 뒤 메모·첨부만 일부 이동하는 흐름을 허용하지 않는다.

현재 `customer_price_agreements`가 거래처 삭제 시 cascade이므로 중복 거래처를 삭제하면 계약 단가가 소실되는 기존 문제도 별도 구현 작업으로 처리한다. 병합 전 계약 단가를 대표 거래처로 옮기고 적용 기간이 겹치면 병합 전체를 중단해야 한다.

## 6. 기존 매출 데이터와 회사 보존

`sales_transactions`는 과거 업로드 데이터로 유지하고 자동 변환하지 않는다. 분석 화면에서는 레거시로 구분해 함께 집계할 수 있지만 미수 원장·명세서·세금계산서 근거에는 자동 포함하지 않는다.

확정 전표와 append-only 원장은 법적·회계적 보존 대상으로 본다. 따라서 관련 기록이 있는 회사는 물리 삭제가 실패하는 것이 의도된 정책이다. 회사 종료는 비활성화/보관으로 처리하고, 실제 삭제·익명화·법정 보존기간은 별도 정책 승인 후 설계한다.

## 7. 세무 확인 사항

줄별 부가세 반올림 합계와 월 단위 `과세 공급가액 합계 × 10%`는 소액 차이가 날 수 있다. 세금계산서 발행 대상 집계 화면은 이 차이를 표시하고 발행 전에 담당자가 확인하도록 한다. 전자발행 연동은 후속 단계다.

## 8. 화면과 단계

### 1단계

- 운영 관리 > 매출 전표: 수기 작성·확정·취소·반품
- 운영 관리 > 매입 전표: 수기 작성·확정·취소·반품
- 전표 상세: 저장 없는 브라우저 A4 거래명세서 인쇄
- 매출처 상세: 기간별 거래처원장 조회와 입금 등록
- 매입처 상세: 기간별 원장 조회와 지급 등록

SQL 범위는 `erp_number_counters`, `business_documents`, `business_document_lines`, `partner_ledger_entries`, 확정/취소 RPC, `record_partner_payment` RPC로 한정한다.

### 2단계 이후

`partner_ledger_issues`, `document_issues`, `document_public_links`, `outbound_message_*`, `saved_views`, PDF 저장, 온라인 명세서, 카카오 이미지 발송, 전자세금계산서 연동을 각각 별도 SQL과 승인으로 진행한다.

## 9. 조회·성능

기간·KST 요일·거래처·매입처·상품·담당자·권역·과세구분·상태를 지원한다. 전표는 회사+일자 커서 페이지네이션, 상대방+일자, 상태+일자 인덱스를 사용하고 라인은 문서·정렬순서 및 상품 인덱스를 사용한다. 수십만 라인까지 원본 합계로 시작하고 실제 측정 후 집계 테이블을 검토한다.
