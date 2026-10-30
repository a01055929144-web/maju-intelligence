# 07 기록 전용 세션 관찰 SQL 검증 계획

> 대상: `docs/sql-drafts/20261030-07-session-observation-record-only.sql`  
> 상태: 검토용. 운영 DB 실행 금지. 기능 플래그 `STAFF_SESSION_OBSERVATION_ENABLED=false` 유지.

## 검증 범위

- 여러 서버리스 인스턴스가 동시에 호출해도 동일 기기·동일 세션 heartbeat는 5분 안에 한 번만 기록된다.
- `appSessionId`/Supabase `session_id` 원문 대신 비밀값을 포함한 64자리 SHA-256 해시만 저장한다.
- 동시 기기는 같은 회사·사용자에서 최근 15분 내 활성인 서로 다른 `device_hash` 수로 판정한다.
- 함수는 판정만 반환하며 `staff_security_alerts`, 알림, 차단, 로그아웃에 부수 효과가 없다.

## PostgreSQL 16 로컬 시나리오

격리된 PostgreSQL 16 DB에 최소 선행 스키마를 만든 뒤 SQL의 `rollback` 직전에서 확인한다. 운영 연결 문자열은 사용하지 않는다.

1. 활성 정규 멤버의 첫 호출은 `recorded=true`, 활성 기기 수 1을 반환한다.
2. 같은 인자로 동시에 20회 호출하면 한 호출만 `recorded=true`이고 행은 1개다.
3. 4분 59초 이내 재호출은 `recorded=false`; 5분 경계 이후는 `recorded=true`다.
4. 같은 기기의 새 `session_hash`는 5분 이내라도 세션 연결과 `first_seen_at`을 교체한다.
5. 서로 다른 두 기기·두 세션이면 `active_device_count=2`, `concurrent_devices=true`다.
6. 같은 세션 해시를 다른 행에 연결하면 고유 제약으로 거절된다.
7. 전달한 회사의 활성 멤버십이 없으면 `42501`이다.
8. 비활성 멤버, 만료된 temporary 멤버, 만료된 세션은 기록/활성 판정에서 제외된다.
9. 철회된 동일 세션 heartbeat는 되살리지 않는다. 같은 기기의 새 세션만 교체할 수 있다.
10. `anon`, `authenticated`, `PUBLIC`은 테이블/함수 접근이 거절되고 `service_role`만 필요한 권한을 가진다.
11. 회사 삭제와 사용자 계정 삭제 시 기존 cascade FK가 관찰 행을 삭제한다.
12. 실행 전후 `staff_security_alerts` 행 수와 정의가 동일하다.

## 정적·회귀 확인

- PostgreSQL 16에서 트랜잭션 실행 후 마지막 `rollback`으로 스키마가 원상 복구되는지 확인한다.
- `EXPLAIN (COSTS OFF)`로 활성 기기 판정 인덱스 사용 가능성을 확인한다.
- 승인된 마이그레이션 적용 전 기존 REST upsert를 RPC로 바꾸지 않는다.
- 연결 승인 후 테스트 환경에서만 플래그를 켜고 서버 해시·현재 멤버십·인증 비차단 정책을 회귀 확인한다.
- 앱 내 알림, 이메일, 자동 잠금, 강제 로그아웃은 별도 승인 전 추가하지 않는다.

## 현재 로컬 제약

- 로컬 `psql`은 설치되어 있지 않다.
- Docker CLI는 있으나 엔진 조회가 응답하지 않았고, 디스크 여유가 부족해 PostgreSQL 16 이미지를 새로 받지 않는다.
- 이번 변경에서는 SQL 실행 결과를 주장하지 않는다. PR의 Linux CI 또는 격리 환경에서 위 시나리오를 실행한다.
