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
6. 같은 세션 해시를 다른 기기 행에 연결해도 기록할 수 있다. 쿠키가 다른 기기에서 재사용되면 두 기기로 판정해야 한다.
7. 전달한 회사의 활성 멤버십이 없으면 `42501`이다.
8. 비활성 멤버, 만료된 temporary 멤버, 만료된 세션은 기록/활성 판정에서 제외된다.
9. 철회된 동일 세션 heartbeat는 되살리지 않는다. 같은 기기의 새 세션만 교체할 수 있다.
9-1. 만료된 기존 행에 같은 세션 해시로 유효한 새 만료 시각이 전달되면 기록을 재개한다. 철회된 행은 이 경로로 되살리지 않는다.
10. `anon`, `authenticated`, `PUBLIC`은 테이블/함수 접근이 거절되고 `service_role`만 필요한 권한을 가진다.
11. 회사 삭제와 사용자 계정 삭제 시 기존 cascade FK가 관찰 행을 삭제한다.
12. 실행 전후 `staff_security_alerts` 행 수와 정의가 동일하다.
13. 각 필수 인자(`company_id`, `user_id`, 두 해시, source, expiry)를 하나씩 `NULL`로 호출하면 기록 없이 `22023`으로 거절된다.
14. 트랜잭션 A가 활성 멤버 행을 `FOR UPDATE`로 잠근 채 관찰을 진행하는 동안 트랜잭션 B의 `status`, `permission_role`, `membership_expires_at` 변경은 대기한다. A 커밋 후 B가 비활성화하면 다음 관찰은 `42501`이고 기존 행의 `last_seen_at`은 바뀌지 않는다.
15. 빈 상태에서 서로 다른 기기·세션 A/B를 두 트랜잭션으로 동시에 호출한다. 멤버십 행의 `FOR UPDATE` 때문에 한 호출은 대기해야 하며, 두 호출이 끝난 뒤 결과 중 하나는 반드시 `active_device_count=2`, `concurrent_devices=true`여야 한다. 최종 행도 서로 다른 기기 2개여야 한다.
16. 같은 `session_hash`를 서로 다른 두 `device_hash`에서 사용해도 고유 인덱스 오류가 없어야 한다. 기기별 행 2개와 `active_device_count=2`, `concurrent_devices=true`를 확인한다. 같은 기기의 반복 호출은 한 행으로 유지한다.
17. 잠금 대기 중 temporary 멤버십 또는 세션이 만료되면, 잠금을 얻은 뒤 갱신한 DB 시각으로 재검사하여 관찰 행을 만들지 않는다.

## 정적·회귀 확인

- 재현 fixture와 assertion은 각각 `tests/sql/session-observation-record-only-fixture.sql`, `tests/sql/session-observation-record-only-assertions.sql`에 둔다. fixture → 검토용 SQL의 바깥 `begin`/`rollback`을 제외한 본문 → assertion 순서로 격리 DB에 입력한다.
- 실제 두 연결의 직렬화는 같은 격리 DB에서 `tests/sql/run-session-observation-concurrency.sh`를 실행해 A=`true/1/false`, B=`true/2/true`, 최종 기기 수 2를 확인한다.
- PostgreSQL 16에서 트랜잭션 실행 후 마지막 `rollback`으로 스키마가 원상 복구되는지 확인한다.
- `EXPLAIN (COSTS OFF)`로 활성 기기 판정 인덱스 사용 가능성을 확인한다.
- 승인된 마이그레이션 적용 전 기존 REST upsert를 RPC로 바꾸지 않는다.
- 연결 승인 후 테스트 환경에서만 플래그를 켜고 서버 해시·현재 멤버십·인증 비차단 정책을 회귀 확인한다.
- 앱 내 알림, 이메일, 자동 잠금, 강제 로그아웃은 별도 승인 전 추가하지 않는다.

## 격리 PostgreSQL 16 실행 결과

- 2026-10-30 KST에 Docker Desktop WSL에 포함된 PostgreSQL 16.14로 운영 연결 없이 검증했다. 새 이미지는 받지 않았다.
- fixture → 검토용 SQL 본문 → assertion 실행 결과 `session observation PG16 assertions passed`를 확인했다.
- 별도 두 연결 병행 실행 결과 A=`true/1/false`, B=`true/2/true`, 최종 기기 수 2를 확인했다.
- 확인 범위: 함수/제약 생성, NULL 거절, 회사 격리, 비활성·만료 멤버 거절, 동일 세션 해시의 두 기기 관찰, 5분 heartbeat dedupe, 만료 세션 재개, 알림 테이블 무변경.
- 임시 데이터 디렉터리와 소켓은 검증 후 제거한다. 이 결과는 검토용 초안 검증이며 운영 적용 승인을 의미하지 않는다.
