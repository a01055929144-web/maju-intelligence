# CX-69 입출금·상계 DB 승인 대기

- 상태: **초안 / 운영 미적용 / DB-APPROVED 없음**
- 선행: CX-64 `business_document_payment_allocations` 승인·적용·사후 읽기 검증
- 적용 대상: `2026-11-17-CX-69-partner-payments-offset.sql`
- 재실행 금지: 운영 적용 시 프로젝트·시각·실행자를 기록하고 원문을 한 번만 실행한다.
- 기능 개방: 적용 뒤 함수 권한·회사 범위·멱등·역분개·상계 PG17과 운영 읽기 검증을 통과한 회사만 `FEATURE_PARTNER_PAYMENTS_COMPANY_IDS`에 추가한다.
- 현재 금지: 운영 SQL 실행, 기능 ON, 실입출금·상계, 배포.
