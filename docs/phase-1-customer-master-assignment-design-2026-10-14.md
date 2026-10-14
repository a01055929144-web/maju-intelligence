# PHASE 1 Customer Master — 권역·호차·차량·담당 배정 설계안

> 상태: **설계 재검토 완료 · 구현/마이그레이션 승인 대기**
> 작성일: 2026-10-14
> `735e000` 설계를 최신 운영 요구로 대체한다. 아래 SQL은 초안이며 실행하지 않았다.

## 1. 결정 사항

- 역할은 사람 자체가 아니라 **배정 관계**에 붙는다. 같은 `company_members.id`가 거래처/리드 영업 담당이면서 특정 날짜의 배송 기사일 수 있다.
- 거래처·리드 영업 담당은 개별 대상에 배정한다. 기존 거래처 27건의 `delivery_manager`는 역할을 재분류하지 않고 거래처 담당으로 백필한다.
- 배송 범위는 권역과 호차로 관리한다. 차량은 교체 가능한 실물 장비이며 거래처 권한 기준이 아니다.
- 노출 범위는 **내가 담당인 거래처·리드 ∪ 그날 내가 기사인 호차의 거래처**다. 중복은 거래처/리드 ID로 제거한다.
- `normalized_customers.delivery_vehicle_id`는 null로 유지한다. 컬럼 삭제는 별도 승인 사안이다.
- `delivery_vehicle` text는 전환 기간 권역 폴백으로 보존한다.
- 모든 배정은 사용자가 화면에서 설정·수정·해제할 수 있어야 한다.
- 직원 백필은 새 권한 판정과 날짜별 코스 판정이 배포·검증된 뒤 별도 승인으로만 실행한다.

## 2. 현재 데이터 조사

### 2-1. 직원 백필 dry-run

- 주 운영 회사: 성공 27, 미매칭 0, 모호 0
- 강민호 대표 10, 이준형 대표님 10, 정두영 7
- 실제 UPDATE는 실행하지 않았다.

### 2-2. 리드 주소의 시·군·구 추출 가능 비율

2026-10-14 운영 DB를 읽기 전용으로 조회했다. 주소에서 시·도 명칭과 뒤따르는 시·군·구 토큰을 정규식으로 찾은 결과다.

| 범위 | 전체 리드 | 추출 가능 | 미매칭 | 비율 |
|---|---:|---:|---:|---:|
| 주 운영 마주식자재(거래처 27곳) | 14,328 | 14,050 | 278 | 98.1% |
| 동일 상호 별도 워크스페이스(거래처 0곳) | 316 | 314 | 2 | 99.4% |
| 합계 | 14,644 | 14,364 | 280 | 98.1% |

주소가 없거나 형식이 불완전한 280건은 임의 추정하지 않고 미배정 대기열로 보낸다. 좌표가 있으면 역지오코딩은 별도 보강 경로로 사용할 수 있지만 자동 배정의 필수 전제는 아니다.

## 3. 현재 이름 문자열 기사 식별 지점

### DB와 저장 로직

- `route_plan_confirmations.driver_name`: 회사·기사명·날짜 UNIQUE이며 확정 코스를 기사 이름으로 조회한다.
- `delivery_vehicles.driver_name`: 레거시 연료 설정을 기사명으로 저장한다.
- `staff_mobile_devices.driver_name`: 라이브 위치의 표시 스냅샷. `user_id`도 있어 안정 ID 전환 가능하다.
- `staff_location_events.driver_name`: 운행기록의 표시 스냅샷. `user_id`도 있어 안정 ID 전환 가능하다.
- `staff_invitations.assigned_manager_name`, `employee_name`, `assigned_vehicle`: 로그인 세션의 이름·권역 폴백을 만든다.
- `normalized_customers.delivery_manager`, `delivery_vehicle`: 현재 거래처 담당자와 권역을 문자열로 판정한다.

### 코드와 화면

- `getRoutePlanConfirmations`, `saveRouteOrderConfirmation`: `driver_name`을 코스 확정 키로 사용한다.
- `getDeliveryHistoryForDate`: `staff_location_events.driver_name`으로 그룹을 만들고 확정 코스와 합친다.
- `getDeliveryVehicleFuelTypes`, `upsertDeliveryVehicleFuelType`, `deleteDeliveryVehicleFuelType`: 기사명을 연료 설정 키로 사용한다.
- `getStaffVehicleLocations`, `toStaffVehicleLocation`: 초대명/사용자명/`driver_name` 순으로 라이브 표시명을 만든다.
- `app/api/routes/confirm-order`, `components/today-course-view.tsx`: `driverName`을 저장 요청에 보낸다.
- `app/mobile/today/page.tsx`: 운영 표시명을 기사명으로 사용해 완료 기록을 필터링한다.
- `sales-route-map-workspace.tsx`, `delivery-history-view.tsx`: 기사명·차량명 문자열로 라이브 신호, 완료 기록, 코스 그룹을 연결한다.

전환 후 `driver_name`은 과거/표시 스냅샷으로만 남기고 판정 키는 `route_unit_id`와 `driver_staff_member_id`를 사용한다.

### `session.assignedVehicle`의 현재 출처와 분리 원칙

- 현재 값은 직원 초대/소속 설정의 `staff_invitations.assigned_vehicle`에서 시작해 `getStaffAssignmentOverride`와 활성 소속 조회를 거쳐 세션에 들어간다.
- 실제 사용처에서는 차량 번호가 아니라 `normalized_customers.delivery_vehicle`과 비교되는 **legacy 권역 라벨**인 동시에, GPS·완료 기록·화면 표시에서는 차량처럼 해석되는 곳이 있어 의미가 섞여 있다.
- 전환 기간에는 `assignedVehicle`을 권역 문자열 폴백으로만 해석한다. 실물 차량 ID·차량명·번호판은 권한 판정에 사용하지 않는다.
- 새 세션 범위는 `companyMemberId`, 담당자 legacy 키, `territoryId`/legacy 권역 라벨로 분리한다. 당일 호차·기사·차량은 `resolveDeliveryPlanForDate` 결과로 계산하며 세션의 정적 차량 문자열로 판정하지 않는다.
- 호차 전환이 끝나면 `assignedVehicle`은 호환용 필드로만 유지하고 신규 쓰기를 중단한다. 화면 표시에는 별도 `routeUnitName`, `vehicleDisplayName`을 사용한다.

## 4. 제안 데이터 모델

모든 신규 테이블은 `company_id`를 포함한다. FK는 `(company_id, id)` 복합 참조로 타 회사 ID 주입을 차단한다. API는 서버 경유를 유지하고 공개 스키마의 신규 테이블은 RLS 활성화 및 `anon`, `authenticated` 직접 권한 회수를 기본으로 한다.

### 4-1. 권역

`delivery_territories`

- `id uuid`, `company_id uuid`, `name text`, `is_active boolean`
- 회사 내 권역명 UNIQUE, `(company_id, id)` UNIQUE

`delivery_territory_areas`

- `company_id`, `territory_id`, `administrative_area`
- `administrative_area`는 표준 시·군·구 키(예: `서울특별시 강남구`, `경기도 의정부시`)
- 회사 내 한 행정구역은 활성 권역 하나에만 속하도록 UNIQUE `(company_id, administrative_area)`

`territory_staff_assignments`

- `company_id`, `territory_id`, `staff_member_id`
- `assignment_role`: 우선 `lead_sales_default`
- `priority integer`, `is_active`, `created_at`, `updated_at`
- UNIQUE `(company_id, territory_id, assignment_role, staff_member_id)`
- 우선순위가 가장 앞선 활성 담당자를 기본 배정하고, 비활성/퇴사 시 다음 순번으로 폴백한다. 부하 분산 라운드로빈이 필요하면 커서 상태를 별도 승인으로 추가한다.

`company_lead_search_regions`에는 nullable `territory_id`를 추가한다. 검색 기준점과 권역의 관계를 명시하되, 기준점 자체를 권역 정의로 사용하지 않는다.

### 4-2. 호차·차량·기사

`delivery_route_units`

- `id`, `company_id`, `territory_id`, `name`(예: 1호차)
- `current_vehicle_id`: 현재 실물 차량
- `default_driver_staff_member_id`: 기본 기사
- `is_active`, `created_at`, `updated_at`
- UNIQUE `(company_id, name)`, `(company_id, id)`

차량 교체는 `current_vehicle_id`만 바꾼다. 기사→차량 직접 연결 테이블은 만들지 않는다. 기사는 호차를 통해 현재 차량과 연결된다.

`delivery_vehicle_master`

- 기존 테이블을 번호판 중심 실물 장비 원장으로 유지한다.
- 이름, 번호판, 연료, 운행 상태를 관리한다.
- 거래처 노출과 코스 포함 여부에는 사용하지 않는다.

### 4-3. 거래처 배송 일정

`customer_delivery_schedule_rules`

- `company_id`, `customer_id`, `route_unit_id`
- `weekday smallint` (`1=월` … `7=일`)
- `cadence`: `weekly` 또는 `biweekly`
- `anchor_date`: 격주 기준일. `biweekly`면 필수이며 `weekday`와 같은 요일이어야 한다.
- `effective_from`, `effective_until`, `is_active`
- 한 거래처에 여러 규칙을 허용한다.

`customer_delivery_date_exceptions`

- `company_id`, `customer_id`, `service_date`
- `exception_type`: `no_delivery` 또는 `override_route_unit`
- `route_unit_id`: override일 때 필수
- UNIQUE `(company_id, customer_id, service_date)`

`route_unit_date_exceptions`

- `company_id`, `route_unit_id`, `service_date`
- `substitute_driver_staff_member_id`, `replacement_vehicle_id`
- 둘 중 하나 이상을 지정한다.
- UNIQUE `(company_id, route_unit_id, service_date)`
- FK의 `ON DELETE SET NULL` 이후에도 행이 유효해야 하므로 DB CHECK로 "하나 이상"을 강제하지 않는다. 생성·수정 API가 하나 이상 입력됐는지 검증하고, 둘 다 null이 된 행은 기본 기사·차량 사용으로 해석한 뒤 정리 대상으로 표시한다.

### 4-4. 거래처·리드 담당

- `normalized_customers.assigned_staff_member_id`: 거래처 영업/관계 담당 배정으로 사용한다.
- `normalized_customers.delivery_territory_id` 신규: 권역 ID. 기존 `delivery_vehicle` text는 전환 폴백이다.
- `business_permit_leads.assigned_staff_member_id`: 리드 담당자
- `business_permit_leads.assigned_territory_id`: 배정 근거 권역
- `business_permit_leads.assignment_mode`: `auto` 또는 `manual`
- `business_permit_leads.assigned_at`

`lead_assignment_events`

- `company_id`, `lead_id`, `territory_id`, `from_staff_member_id`, `to_staff_member_id`
- `assignment_mode`: `auto` 또는 `manual`
- `actor_staff_member_id`(자동이면 null), `reason`, `created_at`
- 자동/수동 변경과 권역 근거를 추적하며 기존 `lead_actions` 영업 컨택 원장과 분리한다.

## 5. 3단계 권한 판정 수정안

범위 객체는 `staffMemberId`, legacy 담당자 키, 권역 ID/legacy 권역 라벨, 조회 날짜를 구분한다.

거래처 노출 판정:

```text
salesMatch =
  customer.assigned_staff_member_id = session.company_member_id
  OR (
    customer.assigned_staff_member_id IS NULL
    AND legacy 담당자명/이메일/사용자 ID가 일치
  )

deliveryMatch =
  resolveDriver(routeUnit, date) = session.company_member_id
  AND customer가 date에 resolveRouteUnit 결과로 해당 routeUnit에 포함

visible = salesMatch OR deliveryMatch
```

전환 기간에는 일정 규칙이 아직 없는 거래처에 한해 `delivery_vehicle` ↔ `assignedVehicle` 권역 문자열 일치를 `deliveryMatch` 폴백으로 유지한다. 따라서 영업 담당 A의 ID가 백필돼도 같은 권역 기사 B는 계속 거래처를 본다. 차량 ID·차량명·번호판은 판정에서 제외한다.

리드 노출은 담당 직원 ID 일치 또는 ID가 없을 때 legacy 담당자 폴백만 사용한다. 리드는 배송 호차 노출 대상이 아니다.

### 권한 전환 영향 경로

공통 판정은 `getCustomerAssignmentKeys`, `filterCustomersByAssignment`, `canAccessAssignedCustomer`에 모으고 아래 호출자가 동일한 합집합 결과를 사용해야 한다.

- 페이지: `app/dashboard/page.tsx`, `app/mobile/today/page.tsx`, `app/crm/timeline/page.tsx`
- 거래처/코스 API: `app/api/customers/route.ts`, `app/api/routes/today/route.ts`, `app/api/routes/distance/route.ts`, 코스 확정·순서·히스토리 경로
- 거래처 운영 API: 고객 요약·관계 상태·상담/방문·문자 발송·리뷰 관련 경로
- 민감 첨부 API: 거래처 첨부 업로드·파일 조회 경로
- 읽기 모델: `getCustomerMaster`, `getCustomerMapSummaries`, `getTodayRoutePlan`

각 경로는 대표/관리자의 전체 범위를 보존하고, 일반 직원에게만 담당 거래처와 당일 기사 호차 거래처의 합집합을 적용한다. 날짜를 받지 않는 요청은 서버 기준 오늘 날짜를 암묵적으로 쓰지 않고 호출자가 업무 날짜를 명시하도록 바꾼다.

## 6. 날짜별 코스 결정 함수

도메인 함수 `resolveDeliveryPlanForDate(companyId, serviceDate)`로 분리하고 UI/API가 같은 결과를 사용한다.

우선순위:

1. 거래처 날짜 예외 `no_delivery` → 제외
2. 거래처 날짜 예외 `override_route_unit` → 지정 호차 포함
3. 적용 기간·요일·주기와 일치하는 일정 규칙 → 규칙 호차 포함
4. 일치 규칙 없음 → 미지정
5. 호차 날짜 예외로 그날 기사와 차량을 덮어씀. 거래처 집합은 바꾸지 않음

같은 날짜에 서로 다른 호차 규칙이 둘 이상 일치하면 임의로 고르지 않고 일정 충돌로 표시한다. 사용자가 날짜 예외로 한 호차를 확정하거나 겹치는 규칙을 수정해야 코스에 포함한다. 같은 호차로 수렴하는 중복 규칙은 거래처 ID 기준 한 번만 포함한다.

격주 예시:

- 거래처: A식당
- 규칙: 1호차, 월요일, 격주, 기준일 `2026-10-05`, 적용 시작 `2026-10-01`
- 포함: 10월 5일, 19일, 11월 2일
- 제외: 10월 12일, 26일
- 판정: 같은 요일이며 `(service_date - anchor_date) % 14 = 0`
- 10월 19일에 `no_delivery` 예외가 있으면 그날만 제외
- 10월 19일 1호차 대타 기사 B/대체 차량 X가 있으면 A식당은 그대로 1호차 코스에 있고 B와 X만 적용

## 7. 리드 자동 배정

### 현재 생성 경로

모든 경로는 최종적으로 `ingestPermitLeadRows`를 통과한다.

- 수동·일괄 업로드: `POST /api/leads/permits`
- 행정안전부 인허가: 수동 API 및 일일 크론 → `syncGovRestaurantLeads`
- 서울시 인허가: 수동 API 및 일일 크론 → `syncSeoulRestaurantLeads`
- 카카오 키워드: 수동 탐색 및 일일 크론 → `runKakaoKeywordLeadSweep`

향후 단건 수동 등록 등 새 경로도 직접 INSERT하지 않고 공통 저장 함수 뒤의 `assignLeadByTerritory`를 호출해야 한다.

### 공통 배정 규칙

1. 주소를 표준화해 시·군·구 키를 추출한다.
2. `delivery_territory_areas`에서 회사 권역을 찾는다.
3. 0개면 미배정 대기열, 중복이면 충돌 대기열로 보낸다.
4. 권역의 활성 `lead_sales_default` 담당자를 priority/순번으로 선택한다.
5. 신규 리드 또는 담당자 미지정 자동 배정 리드에 담당자·권역·`assignment_mode='auto'`를 저장하고 이벤트를 남긴다. 기존 행 갱신은 수동 배정을 덮어쓰지 않는다.
6. `assignment_mode='manual'`인 리드는 자동 수집·주소 보강·권역 담당자 변경으로 재배정하지 않는다.
7. 권역 담당자 변경 화면에서 기존 자동 배정 리드를 `유지` 또는 `새 담당자로 이동` 중 선택한다.
8. 리드→거래처 전환 시 권역과 담당자를 승계하고, 해당 권역의 활성 호차를 추천만 한다. 일정은 사용자가 확정한다.

예시:

- 주소 `서울특별시 강남구 테헤란로 ...` → `서울특별시 강남구` → 강남 권역
- 강남 기본 담당자 A(priority 1), C(priority 2) → 설정된 순번 정책에 따라 A 배정
- 이벤트: `auto`, 근거 권역=강남, 담당자=A, 사유=`address_sigungu_match`
- `경기도 미매핑 시군` 또는 추출 실패 → 담당자 null, 미배정 대기열
- 사용자가 C로 수동 지정 → `manual`; 이후 자동 동기화에서도 C 유지

## 8. 화면 목록

1. **권역 관리**: 권역명, 포함 시·군·구, 활성 상태, 기본 리드 담당자와 우선순위
2. **호차 관리**: 권역, 1호차/2호차, 기본 기사, 현재 차량, 활성 상태
3. **거래처 배송 일정**: 거래처별 호차·요일·매주/격주·기준일·적용 기간, 다중 규칙
4. **날짜별 예외**: 배송 없음, 다른 호차, 호차 대타 기사, 대체 차량
5. **차량 교체**: 호차의 현재 차량만 교체; 영향받는 거래처 수는 읽기 전용으로 표시
6. **미배정 리드**: 주소 미추출, 권역 미매칭, 권역 중복, 담당자 미설정 사유별 큐
7. **리드 배정 이력**: 자동/수동, 이전·새 담당자, 근거 권역, 작업자, 시각
8. **전환 확인**: 리드→거래처 시 권역·담당자 승계와 추천 호차/일정 확정

## 9. 마이그레이션 SQL 초안 — 실행 금지

```sql
begin;

alter table public.normalized_customers
  add constraint normalized_customers_company_id_id_unique unique (company_id, id);
alter table public.business_permit_leads
  add constraint business_permit_leads_company_id_id_unique unique (company_id, id);

create table public.delivery_territories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create table public.delivery_territory_areas (
  company_id uuid not null,
  territory_id uuid not null,
  administrative_area text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, territory_id, administrative_area),
  unique (company_id, administrative_area),
  foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id) on delete cascade
);

create table public.territory_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  territory_id uuid not null,
  staff_member_id uuid not null,
  assignment_role text not null check (assignment_role in ('lead_sales_default')),
  priority integer not null default 1 check (priority > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, territory_id, assignment_role, staff_member_id),
  unique (company_id, territory_id, assignment_role, priority),
  foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id) on delete cascade,
  foreign key (company_id, staff_member_id)
    references public.company_members(company_id, id) on delete cascade
);

create table public.delivery_route_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  territory_id uuid not null,
  name text not null,
  current_vehicle_id uuid,
  default_driver_staff_member_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name),
  foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id),
  foreign key (company_id, current_vehicle_id)
    references public.delivery_vehicle_master(company_id, id)
    on delete set null (current_vehicle_id),
  foreign key (company_id, default_driver_staff_member_id)
    references public.company_members(company_id, id)
    on delete set null (default_driver_staff_member_id)
);

alter table public.route_plan_confirmations
  add column route_unit_id uuid,
  add column driver_staff_member_id uuid;
alter table public.route_plan_confirmations
  add constraint route_plan_confirmations_route_unit_fk
  foreign key (company_id, route_unit_id)
  references public.delivery_route_units(company_id, id)
  on delete set null (route_unit_id),
  add constraint route_plan_confirmations_driver_member_fk
  foreign key (company_id, driver_staff_member_id)
  references public.company_members(company_id, id)
  on delete set null (driver_staff_member_id);

alter table public.staff_mobile_devices
  add column route_unit_id uuid,
  add column vehicle_id uuid,
  add column driver_staff_member_id uuid;
alter table public.staff_mobile_devices
  add constraint staff_mobile_devices_route_unit_fk
  foreign key (company_id, route_unit_id)
  references public.delivery_route_units(company_id, id)
  on delete set null (route_unit_id),
  add constraint staff_mobile_devices_vehicle_fk
  foreign key (company_id, vehicle_id)
  references public.delivery_vehicle_master(company_id, id)
  on delete set null (vehicle_id),
  add constraint staff_mobile_devices_driver_member_fk
  foreign key (company_id, driver_staff_member_id)
  references public.company_members(company_id, id)
  on delete set null (driver_staff_member_id);

alter table public.staff_location_events
  add column route_unit_id uuid,
  add column vehicle_id uuid,
  add column driver_staff_member_id uuid;
alter table public.staff_location_events
  add constraint staff_location_events_route_unit_fk
  foreign key (company_id, route_unit_id)
  references public.delivery_route_units(company_id, id)
  on delete set null (route_unit_id),
  add constraint staff_location_events_vehicle_fk
  foreign key (company_id, vehicle_id)
  references public.delivery_vehicle_master(company_id, id)
  on delete set null (vehicle_id),
  add constraint staff_location_events_driver_member_fk
  foreign key (company_id, driver_staff_member_id)
  references public.company_members(company_id, id)
  on delete set null (driver_staff_member_id);

create table public.customer_delivery_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  route_unit_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  cadence text not null check (cadence in ('weekly', 'biweekly')),
  anchor_date date,
  effective_from date not null,
  effective_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from),
  check ((cadence = 'weekly') or (cadence = 'biweekly' and anchor_date is not null)),
  check ((cadence <> 'biweekly') or (extract(isodow from anchor_date) = weekday)),
  foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade,
  foreign key (company_id, route_unit_id)
    references public.delivery_route_units(company_id, id)
);

create table public.customer_delivery_date_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  service_date date not null,
  exception_type text not null check (exception_type in ('no_delivery', 'override_route_unit')),
  route_unit_id uuid,
  memo text,
  unique (company_id, customer_id, service_date),
  check ((exception_type = 'no_delivery' and route_unit_id is null)
      or (exception_type = 'override_route_unit' and route_unit_id is not null)),
  foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade,
  foreign key (company_id, route_unit_id)
    references public.delivery_route_units(company_id, id)
);

create table public.route_unit_date_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  route_unit_id uuid not null,
  service_date date not null,
  substitute_driver_staff_member_id uuid,
  replacement_vehicle_id uuid,
  memo text,
  unique (company_id, route_unit_id, service_date),
  foreign key (company_id, route_unit_id)
    references public.delivery_route_units(company_id, id) on delete cascade,
  foreign key (company_id, substitute_driver_staff_member_id)
    references public.company_members(company_id, id)
    on delete set null (substitute_driver_staff_member_id),
  foreign key (company_id, replacement_vehicle_id)
    references public.delivery_vehicle_master(company_id, id)
    on delete set null (replacement_vehicle_id)
);

alter table public.normalized_customers
  add column delivery_territory_id uuid;
alter table public.normalized_customers
  add constraint normalized_customers_delivery_territory_fk
  foreign key (company_id, delivery_territory_id)
  references public.delivery_territories(company_id, id)
  on delete set null (delivery_territory_id);

alter table public.business_permit_leads
  add column assigned_staff_member_id uuid,
  add column assigned_territory_id uuid,
  add column assignment_mode text check (assignment_mode in ('auto', 'manual')),
  add column assigned_at timestamptz;
alter table public.business_permit_leads
  add constraint business_permit_leads_assigned_staff_fk
  foreign key (company_id, assigned_staff_member_id)
  references public.company_members(company_id, id)
  on delete set null (assigned_staff_member_id),
  add constraint business_permit_leads_assigned_territory_fk
  foreign key (company_id, assigned_territory_id)
  references public.delivery_territories(company_id, id)
  on delete set null (assigned_territory_id);

create table public.lead_assignment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  territory_id uuid,
  from_staff_member_id uuid,
  to_staff_member_id uuid,
  assignment_mode text not null check (assignment_mode in ('auto', 'manual')),
  actor_staff_member_id uuid,
  reason text not null,
  created_at timestamptz not null default now(),
  foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete cascade,
  foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id)
    on delete set null (territory_id),
  foreign key (company_id, from_staff_member_id)
    references public.company_members(company_id, id)
    on delete set null (from_staff_member_id),
  foreign key (company_id, to_staff_member_id)
    references public.company_members(company_id, id)
    on delete set null (to_staff_member_id),
  foreign key (company_id, actor_staff_member_id)
    references public.company_members(company_id, id)
    on delete set null (actor_staff_member_id)
);

alter table public.company_lead_search_regions add column territory_id uuid;
alter table public.company_lead_search_regions
  add constraint company_lead_search_regions_territory_fk
  foreign key (company_id, territory_id)
  references public.delivery_territories(company_id, id)
  on delete set null (territory_id);

create index idx_territory_staff_assignment_order on public.territory_staff_assignments(company_id, territory_id, assignment_role, priority) where is_active;
create index idx_delivery_route_units_territory on public.delivery_route_units(company_id, territory_id) where is_active;
create index idx_route_confirmations_unit_date on public.route_plan_confirmations(company_id, route_unit_id, route_date) where route_unit_id is not null;
create index idx_staff_mobile_devices_route_unit on public.staff_mobile_devices(company_id, route_unit_id) where route_unit_id is not null;
create index idx_staff_location_events_unit_time on public.staff_location_events(company_id, route_unit_id, recorded_at desc) where route_unit_id is not null;
create index idx_customer_delivery_rules_customer_day on public.customer_delivery_schedule_rules(company_id, customer_id, weekday) where is_active;
create index idx_customer_delivery_rules_unit_day on public.customer_delivery_schedule_rules(company_id, route_unit_id, weekday) where is_active;
create index idx_customer_delivery_exceptions_date on public.customer_delivery_date_exceptions(company_id, service_date);
create index idx_route_unit_exceptions_date on public.route_unit_date_exceptions(company_id, service_date);
create index idx_permit_leads_assigned_staff on public.business_permit_leads(company_id, assigned_staff_member_id) where assigned_staff_member_id is not null;
create index idx_permit_leads_assigned_territory on public.business_permit_leads(company_id, assigned_territory_id) where assigned_territory_id is not null;
create index idx_lead_assignment_events_lead_time on public.lead_assignment_events(company_id, lead_id, created_at desc);

alter table public.delivery_territories enable row level security;
alter table public.delivery_territory_areas enable row level security;
alter table public.territory_staff_assignments enable row level security;
alter table public.delivery_route_units enable row level security;
alter table public.customer_delivery_schedule_rules enable row level security;
alter table public.customer_delivery_date_exceptions enable row level security;
alter table public.route_unit_date_exceptions enable row level security;
alter table public.lead_assignment_events enable row level security;

revoke all on public.delivery_territories, public.delivery_territory_areas,
  public.territory_staff_assignments, public.delivery_route_units,
  public.customer_delivery_schedule_rules, public.customer_delivery_date_exceptions,
  public.route_unit_date_exceptions, public.lead_assignment_events
from anon, authenticated;

commit;
```

실제 마이그레이션은 적용 전 현재 PK/UNIQUE와 Postgres 17의 컬럼 지정 `ON DELETE SET NULL`을 다시 검증하고, `IF NOT EXISTS`/`DO` 블록으로 재실행 가능하게 만든다. 기존 1단계 컬럼이나 데이터를 수정하지 않는다.

`route_plan_confirmations_unique(company_id, driver_name, route_date)`는 새 ID 쓰기 전환이 끝날 때까지 유지한다. 모든 writer가 `route_unit_id`를 저장하는 것이 검증된 다음 별도 마이그레이션에서 이를 `(company_id, route_unit_id, route_date)` partial UNIQUE로 교체하고 `driver_name`은 nullable 표시 스냅샷으로 낮춘다. `delivery_vehicles.driver_name` 기반 연료 설정은 차량 마스터 `fuel_type`로 대체한 뒤 읽기만 중단한다.

## 10. 롤백 SQL 초안 — 실행 금지

```sql
begin;

alter table public.staff_location_events
  drop constraint if exists staff_location_events_driver_member_fk,
  drop constraint if exists staff_location_events_vehicle_fk,
  drop constraint if exists staff_location_events_route_unit_fk,
  drop column if exists driver_staff_member_id,
  drop column if exists vehicle_id,
  drop column if exists route_unit_id;

alter table public.staff_mobile_devices
  drop constraint if exists staff_mobile_devices_driver_member_fk,
  drop constraint if exists staff_mobile_devices_vehicle_fk,
  drop constraint if exists staff_mobile_devices_route_unit_fk,
  drop column if exists driver_staff_member_id,
  drop column if exists vehicle_id,
  drop column if exists route_unit_id;

alter table public.route_plan_confirmations
  drop constraint if exists route_plan_confirmations_driver_member_fk,
  drop constraint if exists route_plan_confirmations_route_unit_fk,
  drop column if exists driver_staff_member_id,
  drop column if exists route_unit_id;

alter table public.company_lead_search_regions
  drop constraint if exists company_lead_search_regions_territory_fk,
  drop column if exists territory_id;

drop table if exists public.lead_assignment_events;

alter table public.business_permit_leads
  drop constraint if exists business_permit_leads_assigned_territory_fk,
  drop constraint if exists business_permit_leads_assigned_staff_fk,
  drop column if exists assigned_at,
  drop column if exists assignment_mode,
  drop column if exists assigned_territory_id,
  drop column if exists assigned_staff_member_id;

alter table public.normalized_customers
  drop constraint if exists normalized_customers_delivery_territory_fk,
  drop column if exists delivery_territory_id;

drop table if exists public.route_unit_date_exceptions;
drop table if exists public.customer_delivery_date_exceptions;
drop table if exists public.customer_delivery_schedule_rules;
drop table if exists public.delivery_route_units;
drop table if exists public.territory_staff_assignments;
drop table if exists public.delivery_territory_areas;
drop table if exists public.delivery_territories;

alter table public.business_permit_leads
  drop constraint if exists business_permit_leads_company_id_id_unique;
alter table public.normalized_customers
  drop constraint if exists normalized_customers_company_id_id_unique;

commit;
```

롤백 전에 신규 배정·일정·예외 데이터를 별도 백업해야 한다. 기존 `delivery_manager`, `delivery_vehicle`, `assignedVehicle`은 이 마이그레이션에서 수정하지 않으므로 전환 기간 롤백 폴백으로 남는다.

## 11. 회귀 테스트

1. 차량을 교체해도 기사에게 보이는 거래처 수와 오늘 코스 ID 집합이 동일하다.
2. 대타 기사 지정일에만 대타가 해당 호차 거래처를 보고, 전후 날짜에는 기본 기사가 본다.
3. 격주 규칙이 기준일로부터 14일 배수인 같은 요일에만 포함된다.
4. 영업+기사 겸직자는 담당 거래처와 당일 호차 거래처를 중복 없이 모두 본다.
5. 영업 담당 A, 권역 기사 B인 거래처에 A의 ID를 백필해도 B가 계속 본다.
6. 권역 내 리드는 기본 담당자에게 자동 배정되고 권역 밖/중복 권역은 미배정된다.
7. 수동 지정 리드는 자동 동기화·주소 보강·권역 담당자 변경 후에도 재배정되지 않는다.
8. 관리자/대표는 전체를 보고 일반 직원만 합집합 범위를 적용받는다.
9. 다른 회사의 권역·호차·차량·직원 ID 저장은 복합 FK 또는 서버 검증으로 거부된다.
10. legacy text만 있는 거래처는 신규 ID 전환 전후 동일하게 노출된다.

## 12. 단계별 구현 순서

1. **3단계 권한 전환 보완**: 담당자 ID 경로와 legacy 권역 OR 경로를 함께 적용. 차량 제외. 운영 계정별 전후 수 비교.
2. **권역 + 리드 자동배정**: 권역/행정구역/기본 담당자, 공통 자동 배정 함수, 미배정 큐, 이력.
3. **호차 + 기사 + 차량**: 호차 원장과 기본 기사·현재 차량. 기존 `assignedVehicle` 의미 분리.
4. **거래처 일정 규칙**: 매주/격주/기간과 route 도메인 결정 함수.
5. **날짜 예외**: 거래처 배송 없음/다른 호차, 호차 대타 기사/대체 차량.
6. **문자열 키 전환**: `route_plan_confirmations`, GPS/운행기록, 레거시 연료 설정을 ID 기반으로 전환하고 문자열은 스냅샷으로 유지.
7. **직원 백필**: 1·6단계 결과와 운영 수량 비교 후 별도 승인으로 27건 UPDATE.
8. **legacy 폴백 계측·정리**: 충분한 안정화 기간 뒤 text-only 쓰기 차단과 미사용 컬럼 삭제를 별도 승인.

각 단계는 독립 커밋·독립 배포·전후 운영 수량 비교가 가능해야 한다. DB 스키마 적용, 백필, 기존 데이터 이관은 매 단계 별도 승인 후 진행한다.
