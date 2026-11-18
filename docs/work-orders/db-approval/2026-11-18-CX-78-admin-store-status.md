# CX-78 관리자 매장 멈추기·풀기 DB 승인표

상태: **승인 전 초안 — 운영 적용 금지**

## 적용 묶음

- `docs/sql-drafts/2026-11-18-CX-78-admin-store-status.sql`
- `docs/sql-drafts/2026-11-18-CX-78-admin-store-status.down.sql`
- `docs/sql-drafts/2026-11-18-CX-78-admin-store-status.pg17.test.sql`

새 테이블·열·인덱스는 만들지 않는다. 기존 `store_profiles.status`, 회사별 `store_accounts` 연결, `admin_audit_logs`만 사용한다.

## 안전 계약

- 대표 관리자 세션만 API에 접근한다.
- 대상 회사가 `FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS` 허용 목록에 있어야 한다.
- 회사와 연결된 매장만 잠그고 `active ↔ suspended`만 허용한다. `closed`는 되살리지 않는다.
- 상태 변경과 감사 기록은 같은 DB 함수·트랜잭션에서 처리한다. 감사 기록 실패 시 상태도 원복된다.
- 회사와 요청 키에 advisory lock을 잡고, 같은 키 재시도는 기존 감사 기록을 반환한다. 같은 키의 다른 대상·상태는 거절한다.
- 함수 실행 권한은 `service_role`에만 있다. 운영 DB 적용, 기능 ON, 배포는 각각 별도 승인 대상이다.

## PG17 검증 범위

로컬 폐기용 PostgreSQL 17에서 아래 항목을 모두 통과했다.

- 정상 멈추기와 풀기
- 같은 요청 키 재시도 시 감사 기록 1건
- 같은 키의 다른 변경 충돌
- 다른 회사에만 연결된 매장 차단
- 종료 매장 재개 차단
- 감사 기록 삽입 실패 시 상태 변경 전체 롤백
- down 뒤 함수 제거, 기존 상태·감사 이력 보존

## 대표 승인 문구

`fcmdvveqmcgtioelzqun 프로젝트에 CX-78 관리자 매장 상태 변경 SQL 적용을 승인합니다.`

이 문구는 SQL 적용만 승인한다. 회사 허용 목록 ON과 운영 배포는 별도 지시가 필요하다.
