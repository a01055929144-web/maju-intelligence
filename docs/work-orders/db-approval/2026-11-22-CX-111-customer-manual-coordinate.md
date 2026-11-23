# CX-111 거래처 수동 좌표 원자 저장 — 운영 DB 승인 대기

## 상태

- SQL 초안·down·PostgreSQL 17 시험만 작성했습니다.
- 운영 DB에는 적용하지 않았고 기능 스위치는 기본 OFF입니다.
- 기존 좌표 칸 5개는 2026-11-16 적용·검증된 상태이며, 이번 초안은 새 칸이나 백필을 만들지 않습니다.

## 적용 목적

`set_customer_manual_coordinate_atomic` 함수 한 개가 회사 범위의 거래처 좌표를 `geocode_accuracy='manual'`로 바꾸고 같은 트랜잭션에서 `admin_audit_logs` 변경 기록을 남깁니다. 감사 저장이 실패하면 좌표 변경도 롤백됩니다.

## 안전 경계

- `anon`·`authenticated`·`public` 실행 금지, 서버 `service_role`만 실행
- 회사 ID와 거래처 ID를 함께 잠그고 다른 회사 거래처는 거절
- 한국 좌표 범위, 행위자 이름, 120자 이하 요청 키 검증
- 동일 요청 키 재시도는 중복 변경·감사를 만들지 않음
- 기존 자동 좌표 저장 함수는 변경하지 않음

## 적용 순서

1. 기능 스위치 `CUSTOMER_MANUAL_COORDINATE_ENABLED=false` 유지
2. `docs/sql-drafts/2026-11-22-CX-111-customer-manual-coordinate.sql` 검토·승인 후 운영 적용
3. 함수 권한과 감사 롤백을 읽기 검증
4. 대표 회사 ID만 회사 목록에 넣고 제한적으로 기능 ON

## 롤백

기능 스위치를 OFF로 한 뒤 down 초안으로 함수만 제거합니다. 기존 좌표와 감사 기록은 보존합니다.
