# PHASE 1 Customer Master — 배송 배정 ID 전환 설계안

> 상태: **1단계 마이그레이션 적용·검증 완료 · 2단계 읽기 모델 완료 · 3단계 권한 전환 설계 승인 대기**
> 작성일: 2026-10-14  
> 직원 백필 SQL은 조회 dry-run만 완료했으며 실제 UPDATE는 실행하지 않았다.

## Problem

`normalized_customers.delivery_manager`와 `delivery_vehicle`이 자유 텍스트다. 오늘 코스, 지도 필터, 담당자별 거래처 범위 제한은 이 문자열을 로그인 사용자 이름·초대 당시 이름·차량 표시명과 비교한다. 표시명 변경, 존칭 차이, 동명이인, 카카오 가입 이름 차이 때문에 같은 사람을 놓치거나 잘못 연결할 수 있다.

2026-10-14 운영 DB 읽기 전용 조사 결과(마주식자재):

- `delivery_manager` 고유값 3개, 배정 거래처 27곳
- 활성 직원 `app_users.name`과 회사 내부에서 유일하게 일치: 고유값 2/3(66.7%), 거래처 17/27(63.0%)
- 불일치: `강민호 대표` 1개 값, 거래처 10곳. 수락된 초대의 `assigned_manager_name`은 `강민호 대표`, 실제 직원명은 `강민호 대표님`이라 초대 별칭까지 사용하면 유일하게 연결된다.
- 동명이인으로 모호한 값: 0개
- `delivery_vehicle` 고유값 3개, 거래처 27곳. 사용자 확인 결과 `강남`·`인천`·`의정부`는 **거래처 노출 범위에 쓰는 권역 라벨**이므로 삭제하거나 차량명으로 바꾸지 않는다.
- 운영 `delivery_vehicle_master` 목록은 현재 전 회사 0대다. 차량은 교체 가능한 운행 자산이며 거래처 권한의 기준이 아니다. `normalized_customers.delivery_vehicle_id`는 null로 유지하고 권역·기사와 차량의 현재 연결은 별도 관계로 관리한다.

## Root Cause

직원 배정 식별자와 화면 표시 문자열이 동일 필드다. 직원 소속을 나타내는 `company_members.id`가 이미 존재하지만 거래처 원장은 이름 문자열로 접근 범위를 계산한다. 반면 `delivery_vehicle`은 실제 차량 식별자가 아니라 권역 라벨인데, 기존 `assignedVehicle`과 GPS의 `delivery_vehicle`도 같은 문자열을 차량 표시와 권한 매칭에 함께 사용해 의미가 섞여 있다.

## Related Domain

- Customer Master
- Organization / Staff membership
- Delivery / Route / Live location
- Tenant authorization scope

## Related Files

### 주요 읽기 경로

- `lib/store.ts`
  - `getCustomerMaster`, `toCustomerMasterItem`
  - `filterCustomersByAssignment`, `canAccessAssignedCustomer`
  - `getTodayRoutePlan`, `getDeliveryCompletionEvents`, `getDeliveryHistoryForDate`
  - `getCompanyDashboardPayload`, 지도·코스 그룹 구성 및 담당자별 필터
- `app/mobile/today/page.tsx`: 로그인 기사 기준 오늘 코스와 완료 기록 조회
- `app/dashboard/page.tsx`: 지도 데이터, 라이브 차량, 차량 마스터 조합
- `components/sales-route-map-workspace.tsx`: 담당자·차량 필터, 거래처 원장, 코스 그룹, 라이브 신호 연결
- `app/crm/timeline/page.tsx`: 거래처 상세·일괄 담당자 변경과 담당자 표시
- `app/dashboard/settings/page.tsx`: 현재 담당자·차량 문자열 목록 표시
- `app/api/customers/route.ts`: 담당자 범위가 적용된 거래처 조회·거래처 저장
- `app/api/staff/location/route.ts`: 기사 범위 위치·완료 기록 조회

### `getCustomerAssignmentKeys` 영향 범위

`lib/auth.ts:getCustomerAssignmentKeys`의 결과는 아래 경로에서 직접 사용된다. 3단계에서는 이 함수의 단순 문자열 배열 반환을 ID와 legacy 키를 구분하는 범위 객체로 바꾸고, 모든 호출처를 한 배포에서 함께 전환해야 한다.

- 페이지: `app/dashboard/page.tsx`, `app/mobile/today/page.tsx`
- 거래처/코스 API: `app/api/customers/route.ts`, `app/api/routes/today/route.ts`, `app/api/routes/distance/route.ts`
- 거래처 운영 API: `app/api/customer-operations/route.ts`, `app/api/customer-operations/summary/route.ts`, `app/api/customer-messages/send/route.ts`
- 첨부 API: `app/api/customer-attachments/upload/route.ts`, `app/api/customer-attachments/file/route.ts`
- 연락처·리뷰·관계 상태 API: `app/api/customers/[id]/contacts/route.ts`, `app/api/customers/[id]/contacts/[contactId]/route.ts`, `app/api/customers/[id]/sync-reviews/route.ts`, `app/api/customers/[id]/summarize-reviews/route.ts`, `app/api/customers/relationship-status/route.ts`
- 내부 판정 함수: `getCustomerMaster`, `getCustomerMapSummaries`, `getTodayRoutePlan`, `filterCustomersByAssignment`, `canAccessAssignedCustomer`

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
- `delivery_vehicle_id uuid`: 마이그레이션으로 추가됐지만 **거래처별 차량 저장과 권한 판정에는 사용하지 않고 null로 유지**한다. 컬럼·FK 삭제 여부는 별도 승인 사안이다.

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
7. `normalized_customers.delivery_vehicle_id`는 백필하지 않는다. 권역·기사와 현재 차량의 연결은 거래처가 아닌 별도 관계에 저장한다.
8. 직원 백필 전후 성공·미매칭·모호 건수를 회사별 실행 로그에 남긴다.

### 3. 전환 기간 호환 전략

- **읽기**: `deliveryManager`와 `deliveryVehicle`은 3·6단계가 끝날 때까지 각각 기존 `delivery_manager`와 권역 text를 그대로 유지한다. ID로 조인된 최신 직원명은 `assignmentDisplayManager`/`assignedStaffName`, 차량명은 `deliveryVehicleName`처럼 별도 표시 필드로만 제공한다.
- **쓰기**: 새 UI/API는 직원 membership ID를 전달한다. 직원 text는 표시 스냅샷으로 함께 갱신하되, 거래처에 차량 ID를 쓰지 않고 `delivery_vehicle` 권역 라벨도 차량명으로 덮어쓰지 않는다.
- **기존 클라이언트**: text만 보내는 요청은 회사 내부에서 유일 후보를 찾을 때만 ID도 채운다. 모호하거나 미매칭이면 text만 보존하고 경고 가능한 결과 코드를 반환한다.
- **표시명 변경**: ID가 있는 거래처는 조인된 최신 이름을 표시하므로 배정이 끊기지 않는다. text는 마지막 저장 당시 스냅샷으로 유지한다.
- **퇴사**: 직원 참조 ID는 `ON DELETE SET NULL`로 해제하고 기존 text는 폴백·감사용으로 보존한다. 비활성 차량은 권역·기사 연결 목록에서 해제 또는 교체하되 거래처 행은 수정하지 않는다.
- 안정화 후에도 text는 감사·폴백용으로 당분간 유지한다. 삭제는 별도 데이터 보존 검토 후 진행한다.

### 3-1. 권역·기사 → 현재 운행 차량 연결 설계

현재 테이블만으로는 두 연결을 안정적으로 표현할 수 없다.

- `delivery_vehicle_master`: 차량 자체의 이름·번호판·연료·운행 상태를 저장하므로 권역이나 기사 배정 컬럼을 직접 넣으면 차량 교체 이력과 다대일 관계가 섞인다.
- `staff_invitations.assigned_vehicle_master_id`: 기존 마이그레이션에 컬럼은 있으나 초대는 온보딩 기록이다. 대표/소유자는 초대가 없고 재초대·초대 삭제 가능성이 있어 현재 기사 배정의 권위 저장소로 부적합하다. 현재 애플리케이션 코드도 이 컬럼을 읽거나 쓰지 않는다.
- `staff_invitations.assigned_vehicle`과 GPS 테이블의 `delivery_vehicle`: text이며 권역·차량 표시가 혼재해 안정적인 차량 ID 연결에 쓸 수 없다.

권장안은 차량 마스터는 그대로 두고 두 개의 작은 현재 연결 테이블을 추가하는 것이다. 스키마 변경은 별도 승인 후 진행한다.

1. `delivery_territory_vehicle_assignments`
   - `company_id`, `territory_label`, `vehicle_id`, `updated_at`, `updated_by`
   - PK/UNIQUE: `(company_id, territory_label)` — 한 권역의 현재 운행 차량은 하나
   - 복합 FK: `(company_id, vehicle_id) -> delivery_vehicle_master(company_id, id)`
   - 차량 교체는 이 행의 `vehicle_id`만 바꾸며 `normalized_customers`는 수정하지 않는다.
2. `delivery_staff_vehicle_assignments`
   - `company_id`, `staff_member_id`, `vehicle_id`, `updated_at`, `updated_by`
   - PK/UNIQUE: `(company_id, staff_member_id)` — 한 기사의 현재 운행 차량은 하나
   - 복합 FK: staff/vehicle 모두 회사 경계를 포함하고, 직원 탈퇴·차량 삭제 시 연결 행만 cascade 또는 삭제한다.
   - 대표·소유자도 `company_members`가 있으므로 초대 유무와 관계없이 연결할 수 있다.

두 테이블은 RLS를 활성화하고 회사 멤버십 기준 정책을 적용한다. 변경 이력이 필요해지면 현재 행을 덮어쓰기보다 별도 audit 로그를 남긴다. 차량 비활성화 시 연결 변경을 요구하되 거래처 노출 범위는 직원 ID와 `delivery_vehicle` 권역 라벨만으로 유지한다.

### 3-2. `session.assignedVehicle` 조사 결과

- 출처: 수락된 `staff_invitations.assigned_vehicle` text를 `getStaffAssignmentOverride`가 읽고, 소셜 로그인 결과와 `getActiveCustomerMembership`을 거쳐 `CustomerSession.assignedVehicle`에 넣는다.
- 권한 판정: `getCustomerAssignmentKeys`가 이 값을 문자열 키에 포함한다. 그 결과 `getCustomerMaster`, `getCustomerMapSummaries`, `canAccessAssignedCustomer`, 오늘 코스와 관련 API가 거래처 `delivery_vehicle`과 비교하므로 현재는 **권역 키 역할**을 한다.
- 비권한 사용: 모바일 오늘 화면의 배송완료 조회 필터, GPS 업로드의 `delivery_vehicle`, 라이브 차량 표시·자동 연결에도 전달된다. 이곳에서는 차량 표시 문자열 역할까지 겸한다.
- 분리안: 3단계에서는 기존 `assignedVehicle`을 `assignedTerritoryLabel` 의미의 legacy 권역 폴백으로만 제한하고 권한 키에는 권역으로 유지한다. 현재 차량은 위 `delivery_staff_vehicle_assignments.vehicle_id` 조인 결과로 별도 세션/조회 모델에 제공한다. GPS·유류·번호판은 차량 ID를 사용하고, 거래처 접근 판정에는 차량 ID나 차량명·번호판을 절대 넣지 않는다.

### 3-3. 3단계 권한 범위 ID 전환 설계 — 구현 전 승인 필요

1. `getActiveCustomerMembership`이 `company_members.id`를 함께 조회하고 `CustomerSession.staffMemberId`에 최신 값을 넣는다. 기존 로그인 쿠키에 값이 없어도 매 요청의 멤버십 재검증에서 복원한다.
2. 문자열 배열인 `getCustomerAssignmentKeys`를 다음 의미가 분리된 범위 객체로 대체한다.
   - `staffMemberId`: 권위 있는 직원 소속 ID
   - `legacyManagerKeys`: 사용자 ID·이름·이메일·초대 정식명·수동 담당자명
   - `territoryLabels`: 기존 `assignedVehicle` text를 권역 폴백으로 해석한 값
   - 대표/관리자는 현재처럼 범위 객체 자체를 반환하지 않아 회사 전체를 본다.
3. 거래처 판정은 다음 순서를 강제한다.
   - `assigned_staff_member_id`가 있으면 세션 `staffMemberId`와 같은 경우만 포함한다. 이름·이메일 폴백을 섞지 않는다.
   - 거래처 ID가 null일 때만 기존 `delivery_manager` 문자열과 `legacyManagerKeys`, `delivery_vehicle` 권역 라벨과 `territoryLabels`를 비교한다.
   - `delivery_vehicle_id`, 차량명, 번호판은 판정식에 포함하지 않는다.
4. `getCustomerMaster`, `getCustomerMapSummaries`, `canAccessAssignedCustomer`가 동일한 판정 헬퍼를 사용한다. 목록과 단건 API의 결과가 달라지는 BOLA 회귀를 막기 위해 중복 판정식을 없앤다.
5. `getTodayRoutePlan`은 이미 `getCustomerMaster` 결과를 사용하므로 같은 범위 객체를 전달한다. 완료·히스토리의 과거 문자열 이벤트는 6단계에서 직원/권역 폴백을 유지한 채 별도로 전환한다.
6. 배포 전 운영 읽기 전용 기준값을 저장한다: 관리자 전체 수, 배송 기사별 수, 초대 별칭 직원별 수, 오늘 코스 수. 새 판정 결과와 동일한지 비교하고 한 건이라도 감소하면 백필하지 않고 원인을 조사한다.
7. 권역→차량 또는 기사→차량 연결을 바꾼 전후에 같은 세션의 거래처 수와 오늘 코스 ID 집합이 완전히 같은지 테스트한다.

### 4. 변경 순서

1. 아래 마이그레이션 적용 및 제약·인덱스 검증 — 완료
2. 읽기 모델에 직원 ID와 별도 표시 필드 추가. 기존 `deliveryManager`/`deliveryVehicle` 의미는 보존 — 완료
3. 기사 권한 범위를 `company_members.id` 기준으로 전환하고 ID가 null인 행만 기존 담당자명·권역 text로 폴백. 차량 ID는 판정에서 제외 — 설계 승인 필요
4. 거래처 단건·일괄 직원 배정 API에 membership ID 입력 추가, 서버에서 company 일치 검증
5. 지도/거래처/설정 UI의 직원 선택값을 membership ID로 전환. 차량은 별도 권역/기사 연결 UI로 분리
6. 오늘 코스·완료 기록·히스토리의 직원 필터를 ID 기준으로 전환하고 권역 폴백을 검증
7. **3단계와 6단계가 모두 ID 기반으로 전환·회귀 검증된 뒤에만** 검증된 직원 백필 SQL 실행(별도 승인 필요)
8. 미매칭·동명이인 운영 정리 후 text 폴백 사용량 계측
9. 폴백이 충분히 줄면 text-only 쓰기를 차단

### 5. 기사·영업 화면 영향

- **오늘 코스**: 로그인 사용자의 `company_members.id`와 거래처 `assigned_staff_member_id`를 직접 비교한다. 표시명 변경 후에도 코스가 유지된다.
- **지도 담당자 필터**: 필터 value를 이름이 아닌 membership ID로 바꾼다. 동명이인은 이름이 같아도 별도 항목으로 표시한다.
- **차량 필터/라이브 위치**: 권역 필터는 기존 `delivery_vehicle` 라벨을 유지한다. 실제 차량 표시는 기사/권역의 현재 차량 연결과 GPS 이벤트의 `user_id`를 사용한다. 차량 교체는 거래처 필터 결과에 영향을 주지 않는다.
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

거래처 차량 백필은 폐기한다. `normalized_customers.delivery_vehicle_id`는 null로 유지하고 차량 교체는 승인 후 추가할 권역/기사 연결 테이블에서만 처리한다.

직원 백필 실행 전에는 동일 후보 로직을 `SELECT`로 바꿔 성공·미매칭·모호 목록을 검토해야 하며, 3·6단계 전환 검증 전에는 실행하지 않는다.

## Rollback

코드 배포는 별도 표시 필드 추가만 되돌릴 수 있다. DB 롤백은 기존 text를 건드리지 않았으므로 다음 순서로 가능하다.

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

- 표시용 현재 직원명을 기존 `deliveryManager`에 덮어쓰면 아직 text로 판정하는 권한·코스 필터가 끊긴다. 2단계에서는 별도 표시 필드만 사용하고 기존 필드 의미를 보존한다.
- 직원 탈퇴/회사 소속 해제 정책을 단순 삭제로 구현하면 FK 충돌 또는 배정 유실이 생길 수 있다.
- 차량 교체 정보를 거래처 행에 저장하면 권역과 접근 범위까지 함께 바뀔 수 있다. 실제 차량 연결은 별도 관계로만 관리한다.
- 관리자 전체 범위와 일반 직원 제한 범위를 같은 필터로 처리하면 권한 회귀가 발생할 수 있다.
- 과거 배송 이벤트에는 ID가 없으므로 폴백을 너무 일찍 제거하면 히스토리가 비어 보인다.

## Test Scenario

1. 직원명 변경 전후 동일 membership에 배정된 오늘 코스가 유지된다.
2. 같은 이름의 직원 2명이 있어도 ID 선택으로 서로 다른 거래처가 표시된다.
3. 타 회사 membership ID를 저장하면 FK 또는 서버 검증으로 거부된다.
4. ID가 null인 기존 거래처는 text 폴백으로 기존 지도·코스에 계속 보이며 `delivery_vehicle` 권역 라벨이 유지된다.
5. `assigned_staff_member_id`가 채워진 거래처도 3단계 전까지 기존 문자열 필터 결과가 바뀌지 않는다.
6. 거래처 단건 저장과 일괄 담당자 변경 후 직원 ID와 표시 스냅샷이 함께 갱신된다.
7. 기사 계정은 자기 membership ID로 배정된 거래처만 보고, 대표/관리자는 회사 전체를 본다.
8. 마주식자재 직원 백필 dry-run은 27/27(초대 별칭 포함)이다. 실제 UPDATE는 3·6단계 검증 및 별도 승인 전 실행하지 않는다.
9. 권역의 운행 차량을 교체해도 기사에게 보이는 거래처 수와 오늘 코스가 동일하다.
10. 관리자·배송 기사·초대 직원(별칭 이름)의 전환 전후 거래처 수가 동일하다.
11. `sales_transactions` import·중복 병합·원장 조회는 이번 단계 전후 동일하게 동작한다.

## Completion Criteria

- 1단계 마이그레이션과 회사 경계를 강제하는 FK·인덱스 검증이 완료됐다.
- 직원 ID 우선/text 폴백이 모든 권한 읽기 경로에 일관되게 적용되고 차량 ID는 판정에서 제외된다.
- 신규 쓰기는 ID와 text 스냅샷을 함께 저장한다.
- 직원 백필은 3·6단계 검증 뒤 별도 승인으로만 실행하며, 유일 매칭만 자동 처리하고 미매칭·동명이인을 보존한다.
- 오늘 코스, 지도 필터, 담당자별 원장 제한의 회귀 테스트가 통과한다.
