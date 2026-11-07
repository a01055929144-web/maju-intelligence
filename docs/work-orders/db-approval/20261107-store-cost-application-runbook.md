# 매장 원가관리 SQL 적용·검증·rollback 실행서

> 상태: **승인 대기 / 실행 금지**
>
> 대상 프로젝트: `fcmdvveqmcgtioelzqun`
>
> 이 문서는 실행 순서만 정리한다. 운영 DB 실행, 배포, `STORE_COSTS` 활성화를 승인하지 않는다.

## 0. 실행 전 필수 조건

아래 조건을 모두 만족하기 전에는 SQL Editor에 초안을 붙여 넣지 않는다.

1. 실행할 main이 보안 가드 병합 commit `abd7f632` 또는 그 후속 commit이어야 하며, `save_store_cost`와 `import_store_cost_batch` 모두 다음 조건을 DB 안에서 확인해야 한다.
   - 구성원 `status = 'active'`
   - 구성원 역할 `owner` 또는 `manager`
   - 부모 매장 `store_accounts.status = 'active'`
   - 부모 매장 `store_accounts.business_status = 'active'`
   - 위 상태를 검사하는 부모 `store_accounts` 행을 `FOR UPDATE`로 잠가 동시 상태 변경과 쓰기를 직렬화
2. 대표가 프로젝트 ID와 시각을 포함한 `DB-APPROVED` 문구를 남겨야 한다.
3. 적용 직전 운영 백업 상태와 복구 담당자를 확인해야 한다.
4. `STORE_COSTS`는 OFF 상태여야 하며 적용·읽기 검증이 끝날 때까지 계속 OFF로 둔다.
5. 아래 객체가 이미 존재하면 덮어쓰지 말고 중단해 기존 정의를 비교한다.

```sql
select
  to_regclass('public.store_cost_items') as store_cost_items,
  to_regclass('public.store_cost_revisions') as store_cost_revisions,
  to_regclass('public.store_cost_imports') as store_cost_imports,
  to_regprocedure('public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)') as save_store_cost,
  to_regprocedure('public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)') as import_store_cost_batch;
```

## 1. 적용 순서

두 파일은 각각 독립된 `begin`/`commit`이다. 두 단계를 하나의 원자적 배포로 간주하면 안 된다.

### 1단계 — 기본 원가 스키마

승인된 main의 다음 파일을 내용 변경 없이 실행한다.

`docs/sql-drafts/20261105-store-cost-management.sql`

이 단계는 다음을 만든다.

- `store_cost_items`
- `store_cost_revisions`
- `save_store_cost(...)`
- RLS, service-role 최소 권한, 검색·이력 인덱스

실행 직후 4절의 기본 스키마 검증을 수행한다. 실패하면 batch SQL로 넘어가지 않는다.

### 2단계 — 원자적 batch import

1단계 검증이 모두 통과한 경우에만 다음 파일을 실행한다.

`docs/sql-drafts/20261107-store-cost-batch-import.sql`

이 단계는 다음을 만든다.

- `store_cost_imports`
- `import_store_cost_batch(...)`
- import UUID·digest 기반 재시도 경계
- service-role 최소 권한

실행 직후 3절의 공통 읽기 검증과 5절의 batch 검증을 수행한다.

### 3단계 — 정지 상태 유지

검증이 끝나도 이 작업에서 다음 행동은 하지 않는다.

- `STORE_COSTS` 또는 회사 allowlist 활성화
- 애플리케이션 배포
- 시험용 원가 행 작성
- 운영 매장으로 API 호출

기능 활성화는 별도 승인과 별도 변경 기록으로 진행한다.

## 2. 적용 도중 실패했을 때

- 1단계가 실패하면 해당 파일의 트랜잭션이 rollback된다. 오류를 수정해 즉시 재실행하지 말고 기존 객체 충돌 여부를 먼저 확인한다.
- 1단계 성공 후 2단계가 실패하면 기본 원가 스키마만 남을 수 있다. 이 상태에서 기능은 계속 OFF로 두며, 원인을 확인한 뒤 아래 중 하나를 별도 승인한다.
  - 2단계만 다시 적용
  - 데이터가 전혀 없음을 확인한 뒤 7절 순서로 1단계까지 rollback
- SQL Editor의 성공 표시만으로 완료 처리하지 않는다. 아래 읽기 검증 결과를 승인 기록에 첨부한다.

## 3. 공통 읽기 검증

다음 쿼리는 데이터를 변경하지 않는다.

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('store_cost_items', 'store_cost_revisions', 'store_cost_imports')
order by c.relname;
```

기대값: 존재하는 세 테이블 모두 `relrowsecurity = true`.

```sql
select
  has_table_privilege('anon', 'public.store_cost_items', 'select') as anon_items,
  has_table_privilege('authenticated', 'public.store_cost_items', 'select') as authenticated_items,
  has_table_privilege('anon', 'public.store_cost_revisions', 'select') as anon_revisions,
  has_table_privilege('authenticated', 'public.store_cost_revisions', 'select') as authenticated_revisions,
  has_table_privilege('anon', 'public.store_cost_imports', 'select') as anon_imports,
  has_table_privilege('authenticated', 'public.store_cost_imports', 'select') as authenticated_imports;
```

기대값: 모두 `false`.

```sql
select
  has_function_privilege('anon', 'public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)', 'execute') as anon_save,
  has_function_privilege('authenticated', 'public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)', 'execute') as authenticated_save,
  has_function_privilege('service_role', 'public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)', 'execute') as service_save,
  has_function_privilege('anon', 'public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)', 'execute') as anon_batch,
  has_function_privilege('authenticated', 'public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)', 'execute') as authenticated_batch,
  has_function_privilege('service_role', 'public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)', 'execute') as service_batch;
```

기대값: `anon_*`과 `authenticated_*`는 `false`, `service_*`는 `true`.

```sql
select p.proname, p.prosecdef, pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('save_store_cost', 'import_store_cost_batch')
order by p.proname;
```

기대값: 두 함수 모두 `prosecdef = false`(`security invoker`).

## 4. 기본 스키마 읽기 검증

```sql
select
  (select count(*) from public.store_cost_items) as item_count,
  (select count(*) from public.store_cost_revisions) as revision_count;
```

신규 적용 직후 기대값: 둘 다 `0`. 기존 데이터가 보이면 즉시 중단하고 출처를 확인한다.

```sql
select company_id, store_account_id, product_key, count(*)
from public.store_cost_items
group by company_id, store_account_id, product_key
having count(*) > 1;
```

기대값: 0행.

```sql
select r.id
from public.store_cost_revisions r
left join public.store_cost_items i
  on i.company_id = r.company_id
 and i.store_account_id = r.store_account_id
 and i.id = r.store_cost_item_id
where i.id is null;
```

기대값: 0행.

가드가 포함됐는지는 함수 원문을 읽어 확인한다.

```sql
select
  position('a.status=''active''' in pg_get_functiondef(
    'public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)'::regprocedure
  )) > 0 as checks_store_status,
  position('a.business_status=''active''' in pg_get_functiondef(
    'public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)'::regprocedure
  )) > 0 as checks_business_status,
  position('for update of a' in lower(pg_get_functiondef(
    'public.save_store_cost(uuid,uuid,uuid,text,text,text,text,date,bigint,uuid,integer,text,text,integer)'::regprocedure
  ))) > 0 as locks_store_account;
```

기대값: 셋 다 `true`.

## 5. batch 스키마 읽기 검증

```sql
select count(*) as import_count from public.store_cost_imports;
```

신규 적용 직후 기대값: `0`.

```sql
select company_id, store_account_id, import_id, count(*)
from public.store_cost_imports
group by company_id, store_account_id, import_id
having count(*) > 1;
```

기대값: 0행.

```sql
select
  position('a.status=''active''' in pg_get_functiondef(
    'public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  )) > 0 as checks_store_status,
  position('a.business_status=''active''' in pg_get_functiondef(
    'public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  )) > 0 as checks_business_status,
  position('for update of a' in lower(pg_get_functiondef(
    'public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure
  ))) > 0 as locks_store_account;
```

기대값: 셋 다 `true`.

## 6. 적용 완료 기록

아래 항목을 DB 승인 기록에 남긴다.

- 실행자와 KST 실행 시각
- 대상 프로젝트 ID
- 실행한 main commit SHA
- 1단계·2단계 각각의 성공 여부
- 3~5절 쿼리 결과
- 기능 플래그가 계속 OFF임을 확인한 결과
- rollback 담당자

## 7. rollback 순서와 범위

rollback은 적용의 역순이다.

1. `docs/sql-drafts/20261107-store-cost-batch-import.down.sql`
2. `docs/sql-drafts/20261105-store-cost-management.down.sql`

각 down 파일은 보호적으로 동작한다.

- `store_cost_imports`에 한 행이라도 있으면 batch down은 `store_cost_import_data_exists`로 중단한다.
- `store_cost_items` 또는 `store_cost_revisions`에 한 행이라도 있으면 기본 down은 `store_cost_data_exists`로 중단한다.
- batch down이 성공하기 전에는 기본 down을 실행하지 않는다.
- down은 해당 원가관리 초안 객체만 제거한다. `store_accounts`, `store_account_members`, 회사·주문·가격표 데이터는 제거하지 않는다.

데이터가 존재하면 자동 rollback 범위를 벗어난다. 데이터를 삭제해 down을 강행하지 않는다. 기능을 OFF로 유지하고, 백업·보존·이관·삭제 여부를 별도 DB 승인과 감사 기록으로 결정한다.

## 8. 현재 결론

- 운영 적용: **미실행**
- 기능 활성화: **OFF 유지**
- 문서 기준 main: `abd7f632` 이상
- 이 문서의 쿼리: 읽기 검증 전용
