# 05 연락 거부 비공개 조회 SQL 검증

> 대상: `docs/sql-drafts/lead-do-not-contact-rpc.sql`
> 상태: 검토용. 운영 DB 실행 금지. `LEAD_DNC_WRITE_ENABLED=false` 유지.

## 격리 검증 범위

- 회사와 리드가 함께 일치하는 활성 DNC만 반환한다.
- 같은 회사의 다른 리드 값과 다른 회사의 같은 연락처를 반환하지 않는다.
- 병합된 리드는 조회하지 않는다.
- 전화·이메일·방문 원문 대신 마스킹 값만 반환한다.
- `anon`, `authenticated`, `PUBLIC`은 함수 실행 권한이 없고 `service_role`만 실행할 수 있다.

재현 fixture와 assertion은 `tests/sql/lead-dnc-private-lookup.pg16.sql`에 있다. 운영 연결 문자열을 사용하지 않고 빈 PostgreSQL 16 데이터 디렉터리에서만 실행한다.

## 운영 승인 전 해시·롤백 검토

- 검증한 PR #103 head는 `7ddd306b573ee018afce2bfe0e1dd208d1479fda`이고 SQL SHA-256은 `64d91c8844cda6ae76ed295652c6b8f3f89213d4a5185f4bded336cdbe931588`이다.
- 승인 기록에는 적용 직전 SQL의 Git 커밋과 SHA-256을 다시 계산해 함께 고정한다. 위 값과 하나라도 다르면 이 검증 결과를 재사용하지 않고 승인을 다시 받는다.
- 적용 전 `pg_get_functiondef`와 `proacl`로 기존 정규화·마스킹·등록·해제 함수 정의와 권한을 별도 보관한다.
- 장애 시 가장 먼저 `LEAD_DNC_WRITE_ENABLED=false`로 되돌려 GET·POST·DELETE 경로를 차단한다.
- 조회 RPC는 실행 권한을 먼저 회수한 뒤 `drop function if exists public.list_active_lead_do_not_contacts(uuid,uuid)`로 제거할 수 있다.
- 이 초안이 덮어쓰는 기존 함수는 단순 삭제하지 않는다. 적용 전에 보관한 정의·권한을 복원해야 한다.
- 롤백 SQL 실행, 운영 DNC 행 삭제, 감사 이력 삭제는 자동 후속 작업이 아니며 각각 별도 승인이 필요하다.

## 실행 결과

- 2026-10-30 KST에 Docker Desktop WSL의 메모리 기반 임시 PostgreSQL 16.14에서 운영 연결 없이 실행했다.
- 회사 2곳, 리드 4건, DNC 6건 fixture로 대상 리드의 SMS·이메일·방문 3건만 반환되는 것을 확인했다.
- 다른 회사의 같은 전화·이메일, 같은 회사의 다른 리드, 회사와 ID가 맞지 않는 리드, 병합 리드는 반환되지 않았다.
- 전화 `010-****-5678`, 이메일 `a***@example.com` 마스킹과 원문 전화·이메일·방문 값 비반환을 확인했다.
- `anon`과 `authenticated` 직접 실행은 각각 `permission denied for function`으로 실패했고, Supabase와 같은 `BYPASSRLS` 속성의 `service_role` 조회는 3건을 반환했다.
- 실행 마지막에 `lead DNC private lookup PG16 assertions passed`를 확인했으며 임시 서버·메모리 데이터 디렉터리는 종료 후 제거됐다.
- 이 검증 통과는 운영 적용이나 기능 활성화 승인을 의미하지 않는다.
