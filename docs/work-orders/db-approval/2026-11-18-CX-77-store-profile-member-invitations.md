# CX-77 매장 단위 직원 초대 — DB 승인 대기

## 상태

- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 적용 SQL: `docs/sql-drafts/20261118-CX-77-store-profile-member-invitations.sql`
- 안전 down: `docs/sql-drafts/20261118-CX-77-store-profile-member-invitations.down.sql`
- SQL 기준 커밋: `927e9ba3e0a960d4339887c75a9a0ebcb5c18069`
- 승인 상태: **미승인 · 미적용**
- 기능 상태: `STORE_PROFILE_INVITATIONS` 기본 OFF, 회사 allowlist 미승인

이 승인표는 SQL 적용 권한을 부여하지 않는다. 대표가 프로젝트와 CX-77을 명시해 별도 승인한 뒤에만 up SQL을 한 번 적용한다. down SQL은 적용 절차에 포함하지 않는다.

## 적용 전 읽기 점검

아래 결과를 값 변경 없이 확인하고 기록한다.

```sql
select
  to_regclass('public.store_profiles') as store_profiles,
  to_regclass('public.store_profile_members') as store_profile_members,
  to_regclass('public.store_accounts') as store_accounts,
  to_regclass('public.store_account_members') as store_account_members,
  to_regclass('public.store_account_member_events') as store_account_member_events,
  to_regclass('public.app_users') as app_users;

select
  to_regclass('public.store_profile_member_invitations') as invitation_table,
  to_regprocedure('public.create_store_profile_member_invitation_v1(uuid,uuid,text,text,text)') as create_rpc,
  to_regprocedure('public.accept_store_profile_member_invitation_v1(text,uuid)') as accept_rpc,
  to_regprocedure('public.remove_store_profile_member_v1(uuid,uuid,uuid)') as remove_rpc;
```

판정:

- 첫 조회의 여섯 항목이 모두 존재해야 한다.
- 두 번째 조회의 테이블과 함수는 모두 없어야 한다. 하나라도 존재하면 원문을 재실행하지 않고 중단한다.
- 적용 전 `STORE_PROFILE_INVITATIONS`와 회사 allowlist는 OFF여야 한다.

## 승인 후 적용 범위

대표 승인 문구는 대상 프로젝트와 CX-77 up SQL 적용을 함께 명시해야 한다. 승인 전에는 아래 명령을 실행하지 않는다.

```text
fcmdvveqmcgtioelzqun CX-77 매장 단위 직원 초대 SQL 승인
```

승인 범위는 위 up SQL 한 번뿐이다. 운영 초대 생성, 카카오 로그인, 구성원 내보내기, 기능 ON, 배포는 각각 별도 승인 대상이다.

## 적용 후 RLS·ACL 읽기 점검

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'store_profile_member_invitations';

select
  has_table_privilege('anon', 'public.store_profile_member_invitations', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.store_profile_member_invitations', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.store_profile_member_invitations', 'insert') as authenticated_insert,
  has_table_privilege('service_role', 'public.store_profile_member_invitations', 'select') as service_select,
  has_table_privilege('service_role', 'public.store_profile_member_invitations', 'insert') as service_insert,
  has_table_privilege('service_role', 'public.store_profile_member_invitations', 'update') as service_update;

select
  p.oid::regprocedure as function_name,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_execute,
  p.prosecdef as security_definer
from pg_proc p
where p.oid in (
  'public.create_store_profile_member_invitation_v1(uuid,uuid,text,text,text)'::regprocedure,
  'public.accept_store_profile_member_invitation_v1(text,uuid)'::regprocedure,
  'public.remove_store_profile_member_v1(uuid,uuid,uuid)'::regprocedure
)
order by p.oid::regprocedure::text;
```

기대 결과:

- invitation 테이블의 `relrowsecurity=true`
- anon/authenticated의 테이블 읽기·쓰기는 모두 `false`
- service_role의 select/insert/update는 `true`
- 세 함수의 anon/authenticated execute는 `false`, service_role execute는 `true`
- 세 함수 모두 `security_definer=false`이며 invoker 계약을 유지

## 적용 후 구조·동작 읽기 점검

```sql
select indexname
from pg_indexes
where schemaname='public' and tablename='store_profile_member_invitations'
order by indexname;

select conname, contype
from pg_constraint
where conrelid='public.store_profile_member_invitations'::regclass
order by conname;
```

확인 항목:

- pending invitation 부분 인덱스 존재
- token hash UNIQUE, role/check, profile/member 복합 FK 존재
- 운영 행 생성 없이 구조와 권한만 확인

## 중단·복구 기준

- 사전 읽기 결과가 기대와 다르면 적용하지 않는다.
- up SQL이 트랜잭션에서 실패하면 오류 원문만 기록하고 임의 수정·부분 재실행을 하지 않는다.
- 초대 이력이 한 건이라도 생기면 down은 의도적으로 거부된다.
- down 검토는 기능 OFF와 초대 이력 0건을 별도로 확인하고 대표가 복구를 승인한 경우에만 진행한다.
