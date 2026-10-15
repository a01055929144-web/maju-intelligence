# 전표 기반 ERP 문서·조회 설계 (2026-10-16)

> 설계 전용 문서입니다. 구현하거나 운영 DB에 적용하지 않습니다. SQL 초안은 `docs/sql-drafts/business-document-erp-foundation.sql`입니다.

## 1. 결론: 공통 전표 모델

`business_documents`와 `business_document_lines`를 매출·매입의 단일 원장으로 사용한다. `document_type`이 `sale`이면 매출처만, `purchase`이면 매입처만 참조하도록 CHECK와 회사 복합 FK를 함께 둔다.

| 방식 | 장점 | 단점 |
|---|---|---|
| 매출·매입 별도 테이블 | 각 업무 용어가 직관적이고 타입별 컬럼 추가가 쉽다. | 채번·확정·취소·금액 계산·검색·원장 기록을 두 벌로 구현해야 하며 합산 리포트가 UNION에 의존한다. |
| 공통 전표(권장) | 상태 전이, 라인 계산, 원장 반영, 출력·검색·감사를 한 경로로 강제할 수 있다. 매출/매입 통합 조회가 단순하다. | 매출처/매입처 다형 관계를 CHECK와 복합 FK로 엄격히 관리해야 하고 타입 전용 필드는 메타데이터 또는 후속 확장 테이블이 필요하다. |

공통 모델은 “명세서·원장·세금계산서·리포트가 전표 금액을 다시 계산하지 않는다”는 원칙에 가장 잘 맞는다. `sales`/`purchase`라는 이름은 UI 용어로 유지하되 저장소만 공통화한다.

## 2. 핵심 데이터 모델

### 2.1 전표 헤더

`business_documents`

- 테넌트: `company_id`; 모든 참조는 `(company_id, id)` 복합 FK
- 구분: `document_type = sale | purchase`
- 상대방: 매출은 `customer_id`, 매입은 `supplier_id`; 둘 중 정확히 하나만 허용
- 날짜: `document_date date`; 기본값은 서버 UTC와 무관하게 KST 오늘
- 번호: `document_number`; `S-2026-000001`/`P-2026-000001`, 회사·유형·연도별 원자 채번, 변경 불가
- 상태: `draft | confirmed | cancelled`; 확정 후 일반 UPDATE/DELETE 금지
- 원천: `manual | order | quote | upload | legacy_import`; `source_id`와 `source_key`로 추적·멱등 처리
- 담당/권역 스냅샷: 담당 직원 ID와 표시명, 권역 ID와 이름을 선택 보관
- 금액: `taxable_supply_amount`, `exempt_supply_amount`, `tax_amount`, `total_amount`. 확정 RPC가 라인 합계를 복사하며 이후 불변
- 취소: 원전표를 수정하지 않고 반대 부호의 취소 전표를 생성해 `reverses_document_id`로 연결

`erp_number_counters`가 `(company_id, sequence_kind, fiscal_year)`별 마지막 번호를 보관한다. `sequence_kind`는 매출·매입 전표뿐 아니라 원장 발행본·명세서 발행본도 포함한다. 채번 함수는 원자 UPSERT를 사용하며 `service_role`만 실행한다. 번호는 초안/발행본 생성 시 부여하고 폐기된 번호는 재사용하지 않는다.

### 2.2 전표 라인

`business_document_lines`

- 매출: `product_catalog_id` 선택, 매입: `supplier_product_id` 선택. 자유 입력 라인도 허용하므로 ID는 nullable
- 스냅샷: 품목코드·품목명·규격·단위·과세구분
- `quantity numeric(14,3)`, `unit_price bigint`(원 단위)
- 공급가액 = `round(quantity × unit_price)`
- 과세 부가세 = `round(공급가액 × 0.1)`, 면세는 0
- 합계 = 공급가액 + 부가세

위 네 금액은 DB generated column로 계산해 견적·주문·출력 코드가 별도 공식을 갖지 못하게 한다. 문서 합계는 확정 RPC가 이 라인 금액만 합산한다. 수량·단가는 음수를 금지하고, 취소는 음수 라인이 아니라 별도 취소 전표로 표현한다.

### 2.3 확정과 불변성

`confirm_business_document(company_id, document_id, actor...)` RPC가 한 트랜잭션에서 다음을 수행한다.

1. 회사 범위로 전표를 `FOR UPDATE` 잠금하고 `draft`인지 확인
2. 라인이 1개 이상인지 확인
3. 라인 generated 금액 합산 → 헤더 금액 저장
4. `confirmed`, `confirmed_at/by` 저장
5. `partner_ledger_entries`에 `document:{id}:confirm` 멱등 키로 한 건 기록

트리거는 confirmed/cancelled 전표와 그 라인의 UPDATE/DELETE를 차단한다. 취소 RPC는 반대 방향 원장 전표를 만들고 원문서 상태만 `cancelled`로 전환한다. 서비스 서버도 `manage_sales`를 검사하지만 DB 제약이 최종 방어선이다.

## 3. 거래처 원장

`partner_ledger_entries`는 append-only다.

- 상대방: `partner_type=customer|supplier` + 대응 ID 하나
- 유형: `sale | receipt | purchase | payment | adjustment | reversal`
- 미수/미지급 증가분은 양수, 입금/지급/취소는 음수
- 전표 확정 시 공급가액·부가세·합계를 그대로 복사하며 재계산하지 않음
- `idempotency_key` 회사 내 UNIQUE, `reverses_entry_id`도 회사 복합 FK
- UPDATE/DELETE 차단 트리거, 정정은 adjustment/reversal 추가

기간 원장 조회는 기간 시작 전 합계가 기초잔액, 기간 내 전표 흐름, 전체 누계가 기말잔액이다. 매출처와 매입처는 같은 조회 함수를 쓰되 파트너 타입만 다르다.

`partner_ledger_issues`는 발행번호, 기간, 기초·기말잔액, 발행 시점의 회사·상대방 정보와 행 전체 JSON 스냅샷, SHA-256 내용 해시를 보관한다. 이후 입금이나 전표가 추가돼도 발행본은 바뀌지 않는다. 재발행은 새 발행번호를 만든다.

## 4. 거래명세서와 공개 문서

### A4/PDF

- 입력은 confirmed 전표 1건뿐이며 헤더/라인 스냅샷 금액을 그대로 출력
- 회사 정보, 거래처 정보, 전표번호·일자, 품목, 과세 공급가액, 면세 공급가액, 부가세, 총액
- 원가·매입처·마진 필드는 출력 DTO와 템플릿에 존재하지 않음
- HTML A4 템플릿을 서버 렌더링하고 Playwright/Chromium 또는 전용 PDF 렌더러로 PDF 생성
- 생성 당시 HTML/PDF 파일 경로, 내용 해시, 템플릿 버전을 `document_issues`에 보관

### 온라인 명세서

`document_public_links`는 원문서가 아닌 발행 스냅샷을 가리킨다. 토큰 원문은 저장하지 않고 SHA-256 해시만 저장하며, 만료·폐기·최대 조회 수를 지원한다. 공개 API는 회사 내부 ID와 원가 관련 필드를 반환하지 않는다. 만료/오타 화면은 공개 견적과 같은 고객용 안내 원칙을 사용한다.

PNG는 발행 스냅샷 HTML을 서버에서 고정 폭으로 렌더링해 생성한다. 브라우저 캡처를 사용자 기기에 맡기지 않아 폰트·줄바꿈을 일관되게 유지한다. 긴 품목은 여러 이미지로 분할하고 메시지 이력에는 생성 파일의 해시를 남긴다.

`outbound_message_jobs`/`outbound_message_attempts`는 단체메시지와 공용으로 사용한다. 어댑터 인터페이스는 `sendKakaoImage`, `sendMms`, `getStatus`이며 카카오 발송 실패 시 정책상 허용되고 수신 동의가 있는 경우에만 MMS로 대체한다. 수신자·문서·채널·템플릿·상태·외부 ID·실패 사유·시각을 저장하고 멱등 키로 중복 발송을 막는다.

## 5. 기존 `sales_transactions` 처리

기존 행은 엑셀 원본을 보존하는 **과거 수입 데이터**로 유지하고 일괄 전표 변환하지 않는다. 품목·세금·단위 스냅샷이 부족해 확정 전표로 승격하면 허위 정밀도가 생기기 때문이다.

- 신규 확정 전표는 `business_documents`만 사용
- 화면은 `sales_activity_union` 보안 호출/서버 쿼리로 두 소스를 함께 반환
- 신규 전표 행은 `source_kind=document`, 과거 행은 `source_kind=legacy_import`
- 같은 업로드에서 전표로 전환한 경우 `source_key`/import ID로 중복 제외
- 과거 데이터는 총매출·날짜·거래처·품목 분석에는 포함하되, 미수금 원장·거래명세서·세금계산서 발행에는 포함하지 않음
- 필요 시 사용자가 과거 행 묶음을 검토해 전표로 승격하는 별도 도구를 만들며 자동 변환은 금지

## 6. 조회·리포트

### 필터

기간, KST 요일, 거래처/매입처, 품목, 담당자, 권역, 과세/면세, 전표 유형, 상태를 지원한다. `document_date`는 이미 KST 업무일이므로 요일도 이 날짜에서 계산한다. 텍스트 검색은 전표번호·상대방 스냅샷·품목명 스냅샷을 대상으로 한다.

### 집계

- 일·주·월·요일: `document_date` 기준
- 거래처·매입처: 헤더 상대방 ID 기준
- 품목: 라인 `product_catalog_id`/`supplier_product_id`, 미연결은 스냅샷명 기준 별도 그룹
- 금액: 라인/헤더의 저장된 공급가액·부가세·합계만 SUM
- 엑셀 내보내기: 동일 필터를 서버에서 재실행해 스트리밍, UI 현재 페이지만 내보내지 않음
- 저장된 조회: `business_document_saved_views`에 필터 JSON, 표시 컬럼, 정렬을 버전과 함께 저장하며 회사·사용자 범위 적용

### 인덱스·성능

- 헤더 기본: `(company_id, document_date desc, id)`, 상대방별 날짜, 상태별 날짜, 담당자/권역별 날짜
- 라인 기본: `(company_id, document_id, sort_order)`, 상품별 문서일 조회를 위해 라인에 `document_date`를 중복 저장하지 않고 헤더 조인 인덱스를 사용; 실제 수십만 행에서 느리면 검증 후 날짜 중복/집계 테이블 도입
- 공개 토큰: 활성 링크만 partial index
- 원장: `(company_id, partner_type, customer_id, entry_date, id)`와 supplier 대응 partial index
- 검색: 초기에는 전표번호 prefix와 정확 ID 필터. 품목명 부분 검색이 병목일 때만 `pg_trgm` GIN 추가
- 페이지네이션: offset 대신 `(document_date, id)` 커서
- 리포트: 우선 인덱스 기반 실시간 집계. 월 수백만 라인에 도달하면 일별 증분 집계 테이블을 confirmed/cancelled 이벤트로 갱신하고 원본 합계 대조 작업 운영
- 배포 전 대표 쿼리를 `EXPLAIN (ANALYZE, BUFFERS)`와 Supabase Index Advisor로 검증

## 7. 문서 생성 흐름

```text
매장 주문/수기 입력/견적 수락
  → 출고 확정
  → draft 매출 전표 + 라인 스냅샷
  → 담당자 검토
  → confirm RPC
      ├─ 전표 금액·상태 확정
      └─ 매출처 원장 미수금 1건(멱등)
  → 거래명세서 발행 스냅샷
      ├─ A4/PDF
      ├─ 만료 공개 링크
      └─ 카카오 이미지 → 실패 시 허용된 MMS 대체
  → 입금 등록
      └─ 원장 입금 전표(음수)

매출 주문 집계
  → 공급처별 발주
  → 입고 확정
  → purchase 전표 확정
  → 매입처 원장 미지급금 1건(멱등)
```

세금계산서/계산서는 confirmed 전표만 묶고, 전표의 과세·면세 저장 금액을 사용한다. 국세청 발행 문서는 별도 상태를 가지지만 금액 원천은 전표다.

## 8. 보안과 테넌트 격리

- 모든 회사 데이터 테이블은 `company_id`를 가지며 회사 복합 FK를 사용
- RLS 활성화 + `anon/authenticated` 권한 회수 + 서버 `service_role` 전용
- 함수는 기본 `security invoker`; 공개 스키마 함수의 PUBLIC 실행 권한 회수
- 공개 링크 조회는 토큰 해시·만료·폐기 조건을 모두 만족한 발행 스냅샷만 반환
- 직원 API는 `manage_sales`; 매장 포털은 별도 인증과 `customer_id` 범위 제한
- 출력/공개/메시지 DTO에서 원가·마진·공급처를 구조적으로 제외

## 9. 단계별 구현 순서

1. **전표 기반**: 공통 헤더·라인·채번·불변 트리거·확정/취소 RPC, 수기 매출/매입 전표
2. **통합 조회**: 필터·커서 페이지네이션·집계·저장된 조회·엑셀, `sales_transactions` 읽기 통합
3. **원장**: append-only 원장, 입금/지급/조정, 원장 조회와 발행 스냅샷
4. **명세서**: A4/PDF와 발행 이력, 공개 토큰 링크
5. **발송**: 공용 메시지 작업/시도, 카카오 이미지 어댑터, 조건부 MMS 대체
6. **업무 연결**: 주문→출고→매출 전표, 발주·입고→매입 전표
7. **세무 문서**: 세금계산서/계산서 어댑터가 confirmed 전표 금액만 소비

각 단계는 SQL을 별도 마이그레이션으로 다시 검토한 후 적용한다. 이 초안은 한 번에 운영 적용하지 않는다.
