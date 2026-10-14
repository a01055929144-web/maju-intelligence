# PHASE 1 Customer Master — 배송 배정 ID 전환 설계안

> 상태: **설계 승인 완료 · 1단계 마이그레이션 적용 승인 대기**
> 작성일: 2026-10-14  
> 이 문서의 SQL은 초안이며 운영 DB에 실행하지 않았다.

## Problem

`normalized_customers.delivery_manager`와 `delivery_vehicle`이 자유 텍스트다. 오늘 코스, 지도 필터, 담당자별 거래처 범위 제한은 이 문자열을 로그인 사용자 이름·초대 당시 이름·차량 표시명과 비교한다. 표시명 변경, 존칭 차이, 동명이인, 카카오 가입 이름 차이 때문에 같은 사람을 놓치거나 잘못 연결할 수 있다.

2026-10-14 운영 DB 읽기 전용 조사 결과(마주식자재):

- `delivery_manager` 고유값 3개, 배정 거래처 27곳
- 활성 직원 `app_users.name`과 회사 내부에서 유일하게 일치: 고유값 2/3(66.7%), 거래처 17/27(63.0%)
- 불일치: `강민호 대표` 1개 값, 거래처 10곳. 수락된 초대의 `assigned_manager_name`은 `강민호 대표`, 실제 직원명은 `강민호 대표님`이라 초대 별칭까지 사용하면 유일하게 연결된다.
- 동명이인으로 모호한 값: 0개
- `delivery_vehicle` 고유값 3개, 거래처 27곳. 사용자 확인 결과 `강남`·`인천`·`의정부`는 **권역이면서 그 권역 전담 차량을 나타내는 운영 라벨**이므로 삭제하거나 차량명으로 바꾸지 않는다.
- 운영 `delivery_vehicle_master` 목록은 현재 전 회사 0대다. 따라서 `delivery_vehicle_id`는 권역별 차량이 등록되고 사용자가 명시적으로 연결한 뒤에만 채운다.

## Root Cause

배정의 식별자와 화면 표시 문자열이 동일 필드다. 직원 소속을 나타내는 `company_members.id`와 차량을 나타내는 `delivery_vehicle_master.id`가 이미 존재하지만 거래처 원장이 이를 참조하지 않는다. 차량·직원 선택 UI도 이름을 저장하고, 읽기 경로는 정규화한 문자열 집합으로 접근 범위를 계산한다.

## Related Domain

- Customer Master
- Organization / Staff membership
- Delivery / Route / Live location
- Tenant authorization scope

## Related Files

### 주요 읽기 경로

- `lib/store.ts`
  - `getCustomerMaster`, `toCustomerMasterItem`
  - `filterCustomersByAssignment`, `getCustomerAssignmentKeys`
  - `getTodayRoutePlan`, `getDeliveryCompletionEvents`, `getDeliveryHistoryForDate`
  - `getCompanyDashboardPayload`, 지도·코스 그룹 구성 및 담당자별 필터
- `app/mobile/today/page.tsx`: 로그인 기사 기준 오늘 코스와 완료 기록 조회
- `app/dashboard/page.tsx`: 지도 데이터, 라이브 차량, 차량 마스터 조합
- `components/sales-route-map-workspace.tsx`: 담당자·차량 필터, 거래처 원장, 코스 그룹, 라이브 신호 연결
- `app/crm/timeline/page.tsx`: 거래처 상세·일괄 담당자 변경과 담당자 표시
- `app/dashboard/settings/page.tsx`: 현재 담당자·차량 문자열 목록 표시
- `app/api/customers/route.ts`: 담당자 범위가 적용된 거래처 조회·거래처 저장
- `app/api/staff/location/route.ts`: 기사 범위 위치·완료 기록 조회

### 주요 쓰기 경로

- `lib/store.ts`
  - `upsertCustomerMaster`
  - `bulkUpdateDeliveryManager`
  - `bulkUpdateDeliveryVehicle`
  - `clearCustomerDeliveryAssignment`
- `app/api/customers/route.ts`
- `app/api/customers/bulk-manager/route.ts`
- `app/api/customers/bulk-vehicle/route.ts`
- `components/sales-route-map-workspace.tsx`
- `app/crm/timeline/page.tsx`

## Related DB (Table / RPC / Trigger)

- `normalized_customers`: 현재 `delivery_manager text`, `delivery_vehicle text`
- `company_members`: 회사별 직원 소속. `user_id -> app_users.id`
- `app_users`: 사용자 표시명 `name`
- `staff_invitations`: 수락 직원의 과거/운영 별칭과 `accepted_by`
- `delivery_vehicle_master`: 회사별 차량 마스터
- `staff_mobile_devices`, `staff_location_events`: 현재 기사·차량 표시 문자열과 사용자 ID를 함께 보유
- `sales_transactions`: `customer_key text`로 거래처와 논리 연결

## Proposed Fix

### 1. 참조 컬럼과 테넌트 안전 FK

`normalized_customers`에 다음 nullable 컬럼을 추가한다.

- `assigned_staff_member_id uuid`: `app_users.id`가 아니라 **회사 소속 레코드인 `company_members.id`**를 참조한다. 퇴사·소속 해제와 동명이인을 회사 단위로 처리할 수 있다.
- `delivery_vehicle_id uuid`: `delivery_vehicle_master.id`를 참조한다.

직접 단일 FK만 두면 다른 회사의 직원·차량 ID가 들어갈 수 있으므로 `(company_id, id)` 복합 UNIQUE와 복합 FK를 사용한다. 운영 DB는 PostgreSQL 17.6이다. PostgreSQL 15 이상에서는 복합 FK의 `ON DELETE SET NULL` 뒤에 null 처리할 컬럼 목록을 지정할 수 있으므로, `company_id`는 유지하고 `assigned_staff_member_id` 또는 `delivery_vehicle_id`만 null 처리한다.

인덱스:

- `(company_id, assigned_staff_member_id)` where ID is not null
- `(company_id, delivery_vehicle_id)` where ID is not null

### 2. 백필 규칙

1. 같은 회사 안에서만 후보를 만든다.
2. 비교 정규화는 앞뒤 공백 제거, 내부 공백 제거, 소문자화까지만 한다. `대표`·`대표님`처럼 의미가 달라질 수 있는 접미사를 임의 제거하지 않는다.
3. 직원 후보 별칭은 활성 `company_members -> app_users.name`과, 해당 회원이 수락한 `staff_invitations.employee_name`·`assigned_manager_name`을 사용한다.
4. 하나의 텍스트가 정확히 한 `company_members.id`로 수렴할 때만 백필한다.
5. 후보 0개는 ID를 null로 두고 기존 text를 보존한다. 후보 2개 이상은 동명이인 검토 큐로 남기며 자동 배정하지 않는다.
6. `delivery_vehicle`은 권역 라벨로 영구 보존한다. 차량명·번호판과 문자열이 같아도 자동 백필하지 않는다.
7. 차량 ID는 사용자가 확정한 `권역 라벨 -> delivery_vehicle_master.id` 매핑표로만 백필한다. 아직 차량 마스터가 0대이므로 현재 백필 대상은 없다.
8. 백필 전후 성공·미매칭·모호 건수를 회사별로 별도 결과 테이블 또는 실행 로그에 남긴다.

### 3. 전환 기간 호환 전략

- **읽기**: ID가 있으면 조인된 현재 직원명/차량명을 권위값으로 사용하고, ID가 없을 때만 기존 text로 폴백한다.
- **쓰기**: 새 UI/API는 직원 membership ID와 차량 ID를 전달한다. 직원 text는 표시 스냅샷으로 함께 갱신하되, 차량의 `delivery_vehicle` text는 권역 라벨이므로 차량명으로 덮어쓰지 않는다.
- **기존 클라이언트**: text만 보내는 요청은 회사 내부에서 유일 후보를 찾을 때만 ID도 채운다. 모호하거나 미매칭이면 text만 보존하고 경고 가능한 결과 코드를 반환한다.
- **표시명 변경**: ID가 있는 거래처는 조인된 최신 이름을 표시하므로 배정이 끊기지 않는다. text는 마지막 저장 당시 스냅샷으로 유지한다.
- **퇴사/차량 비활성화**: 참조 ID는 유지하되 선택 목록에서는 비활성 상태로 표시해 과거 배정을 추적한다. 실제 재배정 시 새 ID로 바꾼다.
- 안정화 후에도 text는 감사·폴백용으로 당분간 유지한다. 삭제는 별도 데이터 보존 검토 후 진행한다.

### 4. 변경 순서

1. 아래 마이그레이션 적용 및 제약·인덱스 검증
2. 읽기 모델에 ID 필드와 조인 결과 추가, ID 우선/text 폴백 적용
3. 기사 권한 범위를 `company_members.id` 기준으로 전환하고 text 폴백 유지
4. 거래처 단건·일괄 배정 API에 ID 입력 추가, 서버에서 company 일치 검증
5. 지도/거래처/설정 UI의 선택값을 ID로 전환
6. 오늘 코스·완료 기록·히스토리의 필터를 ID 기준으로 전환
7. 검증된 백필 SQL 실행(별도 승인 필요)
8. 미매칭·동명이인 운영 정리 후 text 폴백 사용량 계측
9. 폴백이 충분히 줄면 text-only 쓰기를 차단

### 5. 기사·영업 화면 영향

- **오늘 코스**: 로그인 사용자의 `company_members.id`와 거래처 `assigned_staff_member_id`를 직접 비교한다. 표시명 변경 후에도 코스가 유지된다.
- **지도 담당자 필터**: 필터 value를 이름이 아닌 membership ID로 바꾼다. 동명이인은 이름이 같아도 별도 항목으로 표시한다.
- **차량 필터/라이브 위치**: `delivery_vehicle_id`를 우선 사용하고 GPS 이벤트의 `user_id`를 membership으로 해석한다. 기존 `delivery_vehicle` 문자열은 권역 라벨 및 ID 미지정 폴백으로 유지한다.
- **담당자별 원장 범위 제한**: 영업·배송 직원의 허용 거래처 조건을 ID로 적용한다. 관리자/대표의 회사 전체 범위 규칙은 유지한다.
- **완료·히스토리**: 과거 이벤트는 문자열뿐이므로 과거 조회는 문자열 폴백을 유지하고 신규 이벤트부터 ID 스냅샷 추가를 후속 검토한다.

### 6. `sales_transactions.customer_key` FK 검토

PHASE 1에서는 기존 `customer_key`를 FK로 바꾸지 않는다.

- `customer_key`는 import 시 만들어지는 비즈니스 키이며 거래처 원장 생성보다 거래가 먼저 들어올 수 있다.
- 중복 거래처 병합 시 `customer_key`를 새 키로 갱신하는 로직이 이미 있고, 이를 즉시 FK로 만들면 미매칭 수입 행 전체가 실패할 수 있다.
- `normalized_customers.normalized_key`는 현재 회사 단위 UNIQUE 제약이 명시되어 있지 않아 안전한 FK 대상이 아니다.

후속 단계에서는 `sales_transactions.customer_id uuid null`을 추가해 `(company_id, customer_id)` 복합 FK로 연결하고, 미매칭 거래는 `customer_key`로 보존하는 dual-reference 방식이 안전하다. 이는 배송 배정 ID 전환과 별도 마이그레이션으로 분리한다.

### 7. DELETE 경로 조사

- `company_members` 직접 DELETE: `lib/store.ts`의 `leaveCustomerWorkspace` 한 곳. 새 FK는 `ON DELETE SET NULL (assigned_staff_member_id)`이므로 배정 거래처가 있어도 워크스페이스 나가기가 막히지 않는다.
- `deleteStaffInvitation`: `company_members`를 삭제하지 않고 `status='inactive'`로 변경한다.
- 개인 워크스페이스 정리의 `companies` DELETE: 회사 하위 거래처·소속·차량이 함께 cascade 삭제되므로 개별 배정 ID를 보존할 대상이 없다.
- `delivery_vehicle_master` 직접 DELETE: 현재 없음. `app/api/delivery-vehicle-master/route.ts`와 `vehicleMasterRepository`는 생성·수정·상태 변경만 제공한다.
- `deleteDeliveryVehicleFuelType`: 레거시 `delivery_vehicles` 행만 삭제하며 `delivery_vehicle_master`를 삭제하지 않는다.

## Migration SQL Final — 적용 승인 전 실행 금지

저장 파일: `supabase/migrations/20261014084917_phase1_customer_assignment_ids.sql`

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.normalized_customers
  add column if not exists assigned_staff_member_id uuid,
  add column if not exists delivery_vehicle_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_members'::regclass
      and conname = 'company_members_company_id_id_unique'
  ) then
    alter table public.company_members
      add constraint company_members_company_id_id_unique unique (company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.delivery_vehicle_master'::regclass
      and conname = 'delivery_vehicle_master_company_id_id_unique'
  ) then
    alter table public.delivery_vehicle_master
      add constraint delivery_vehicle_master_company_id_id_unique unique (company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.normalized_customers'::regclass
      and conname = 'normalized_customers_assigned_staff_member_fk'
  ) then
    alter table public.normalized_customers
      add constraint normalized_customers_assigned_staff_member_fk
      foreign key (company_id, assigned_staff_member_id)
      references public.company_members (company_id, id)
      on delete set null (assigned_staff_member_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.normalized_customers'::regclass
      and conname = 'normalized_customers_delivery_vehicle_fk'
  ) then
    alter table public.normalized_customers
      add constraint normalized_customers_delivery_vehicle_fk
      foreign key (company_id, delivery_vehicle_id)
      references public.delivery_vehicle_master (company_id, id)
      on delete set null (delivery_vehicle_id);
  end if;
end
$$;

create index if not exists idx_normalized_customers_company_staff_assignment
  on public.normalized_customers (company_id, assigned_staff_member_id)
  where assigned_staff_member_id is not null;

create index if not exists idx_normalized_customers_company_vehicle_assignment
  on public.normalized_customers (company_id, delivery_vehicle_id)
  where delivery_vehicle_id is not null;

commit;
```

실제 마이그레이션 파일은 재실행 가능하도록 제약·컬럼 존재 검사를 포함해야 한다.

## Backfill SQL Draft — 실행 금지

```sql
-- 직원 별칭 하나가 회사 내부의 한 membership으로만 수렴하는 경우에만 반영한다.
with staff_aliases as (
  select cm.company_id, cm.id as member_id,
         lower(regexp_replace(btrim(au.name), '\s+', '', 'g')) as alias_key
  from public.company_members cm
  join public.app_users au on au.id = cm.user_id
  where cm.status = 'active' and au.status = 'active'
  union
  select si.company_id, cm.id,
         lower(regexp_replace(btrim(alias_value), '\s+', '', 'g'))
  from public.staff_invitations si
  join public.company_members cm
    on cm.company_id = si.company_id and cm.user_id = si.accepted_by
  cross join lateral unnest(array[si.employee_name, si.assigned_manager_name]) alias_value
  where si.status = 'accepted' and cm.status = 'active'
    and nullif(btrim(alias_value), '') is not null
), unique_staff_aliases as (
  select company_id, alias_key, (array_agg(member_id order by member_id))[1] as member_id
  from staff_aliases
  group by company_id, alias_key
  having count(distinct member_id) = 1
)
update public.normalized_customers nc
set assigned_staff_member_id = usa.member_id
from unique_staff_aliases usa
where nc.company_id = usa.company_id
  and nc.assigned_staff_member_id is null
  and lower(regexp_replace(btrim(nc.delivery_manager), '\s+', '', 'g')) = usa.alias_key;

```

차량 백필은 위 직원 백필 SQL과 별도로 취급한다. 사용자가 권역별 차량을 확정하기 전에는 차량 UPDATE SQL을 만들거나 실행하지 않는다. 확정 후에는 다음처럼 명시적 매핑만 사용한다.

```sql
-- 실행 금지: 사용자가 실제 vehicle_id를 확정한 뒤 VALUES를 채워 별도 승인한다.
with approved_vehicle_mapping(company_id, territory_label, vehicle_id) as (
  values
    -- ('<company_uuid>'::uuid, '강남', '<vehicle_uuid>'::uuid)
    (null::uuid, null::text, null::uuid)
)
update public.normalized_customers nc
set delivery_vehicle_id = m.vehicle_id
from approved_vehicle_mapping m
join public.delivery_vehicle_master v
  on v.company_id = m.company_id and v.id = m.vehicle_id
where m.company_id is not null
  and nc.company_id = m.company_id
  and nc.delivery_vehicle = m.territory_label;
```

백필 실행 전에는 동일 후보 로직을 `SELECT`로 바꿔 성공·미매칭·모호 목록을 검토해야 한다.

## Rollback

코드 배포는 ID 우선/text 폴백 상태에서 먼저 되돌릴 수 있다. DB 롤백은 기존 text를 건드리지 않았으므로 다음 순서로 가능하다.

```sql
begin;
drop index if exists public.idx_normalized_customers_company_vehicle_assignment;
drop index if exists public.idx_normalized_customers_company_staff_assignment;
alter table public.normalized_customers
  drop constraint if exists normalized_customers_delivery_vehicle_fk,
  drop constraint if exists normalized_customers_assigned_staff_member_fk,
  drop column if exists delivery_vehicle_id,
  drop column if exists assigned_staff_member_id;
alter table public.delivery_vehicle_master
  drop constraint if exists delivery_vehicle_master_company_id_id_unique;
alter table public.company_members
  drop constraint if exists company_members_company_id_id_unique;
commit;
```

## Regression Risk

- ID 필드가 있는데 일부 읽기 경로가 계속 text를 우선하면 화면별 배정이 달라질 수 있다.
- 직원 탈퇴/회사 소속 해제 정책을 단순 삭제로 구현하면 FK 충돌 또는 배정 유실이 생길 수 있다.
- 차량의 현재 text 값이 권역처럼 사용된 데이터가 있어 차량 ID로 기계 치환하면 코스 그룹 의미가 바뀔 수 있다.
- 관리자 전체 범위와 일반 직원 제한 범위를 같은 필터로 처리하면 권한 회귀가 발생할 수 있다.
- 과거 배송 이벤트에는 ID가 없으므로 폴백을 너무 일찍 제거하면 히스토리가 비어 보인다.

## Test Scenario

1. 직원명 변경 전후 동일 membership에 배정된 오늘 코스가 유지된다.
2. 같은 이름의 직원 2명이 있어도 ID 선택으로 서로 다른 거래처가 표시된다.
3. 타 회사 membership/vehicle ID를 저장하면 FK 또는 서버 검증으로 거부된다.
4. ID가 null인 기존 거래처는 text 폴백으로 기존 지도·코스에 계속 보이며 `delivery_vehicle` 권역 라벨이 유지된다.
5. 퇴사 직원·비활성 차량의 과거 배정은 조회되며 신규 선택 목록에서는 상태가 표시된다.
6. 거래처 단건 저장과 일괄 담당자 변경 후 직원 ID와 표시 스냅샷이 함께 갱신되고, 차량 지정 후에도 기존 권역 라벨은 바뀌지 않는다.
7. 기사 계정은 자기 membership ID로 배정된 거래처만 보고, 대표/관리자는 회사 전체를 본다.
8. 마주식자재 직원 백필 dry-run은 27/27(초대 별칭 포함)을 예상한다. 차량은 사용자가 권역별 차량을 지정하기 전 0/27을 유지한다.
9. `sales_transactions` import·중복 병합·원장 조회는 이번 단계 전후 동일하게 동작한다.

## Completion Criteria

- 설계 승인 후에만 마이그레이션을 적용한다.
- 회사 경계를 강제하는 FK와 인덱스가 존재한다.
- ID 우선/text 폴백이 모든 읽기 경로에 일관되게 적용된다.
- 신규 쓰기는 ID와 text 스냅샷을 함께 저장한다.
- 백필은 유일 매칭만 자동 처리하며 미매칭·동명이인을 보존한다.
- 오늘 코스, 지도 필터, 담당자별 원장 제한의 회귀 테스트가 통과한다.
