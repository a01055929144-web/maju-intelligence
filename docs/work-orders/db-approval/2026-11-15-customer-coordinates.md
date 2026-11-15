# 거래처 좌표 저장 — DB 승인 요청

## 상태와 범위

- 이 문서는 SQL 초안 검토용이다. 운영 DB에는 아직 적용하지 않았다.
- up: `docs/sql-drafts/2026-11-15-customer-coordinates.sql`
- down: `docs/sql-drafts/2026-11-15-customer-coordinates.down.sql`
- PG17 시험: `docs/sql-drafts/2026-11-15-customer-coordinates.pg17.test.sql`
- `normalized_customers`에 nullable 좌표 5개 칸과 일관성 check만 추가한다. 앱 코드, RLS 정책, grant, 기존 행 값은 바꾸지 않는다.
- 정확도 값은 `exact`(정확한 주소), `approx`(추정), `manual`(지도에서 직접 지정), `lead`(전환된 리드 좌표)만 허용한다.

## 승인 질문 A — 스키마만 적용

아래 up 초안을 운영 DB에 한 번 적용해도 되는가?

- 한 트랜잭션이며 `set local lock_timeout = '3s'`, `statement_timeout = '20s'`를 사용한다.
- 기존 행은 다섯 칸이 모두 null로 남는다. 백필은 포함하지 않는다.
- 위도 33~39, 경도 124~132만 허용한다.
- 좌표가 있으면 정확도와 갱신 시각도 있어야 한다. `manual` 좌표는 주소 없이 저장할 수 있다.
- `admin_audit_logs`에 스키마 추가 기록 1건을 남긴다. 회사 데이터나 실제 주소는 기록하지 않는다.

## 적용 전 읽기 점검

```sql
select count(*) as existing_rows,
       count(*) filter (where address is not null) as rows_with_address
from public.normalized_customers;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'normalized_customers'
  and column_name in ('latitude', 'longitude', 'geocode_accuracy', 'geocoded_at', 'geocoded_address');

select relrowsecurity, relforcerowsecurity, relacl
from pg_class
where oid = 'public.normalized_customers'::regclass;

select polname, polcmd, polroles, polqual, polwithcheck
from pg_policy
where polrelid = 'public.normalized_customers'::regclass
order by polname;
```

두 번째 조회가 0행인지 확인하고, RLS·정책·권한 결과를 적용 후 비교용으로 보관한다.

## 적용 순서

1. 앱 배포와 운영 쓰기를 중단하고 위 읽기 점검 결과를 기록한다.
2. 승인된 up 원문을 운영 DB에 한 번 실행한다. 재실행하지 않는다.
3. 아래 읽기 검증에서 기존 행 변경 0건, RLS·정책·권한 불변, 감사 기록 1건을 확인한다.
4. 앱은 아직 좌표 칸을 사용하지 않는다. 후속 CC-48-5 앱 PR과 배포는 별도 승인한다.

## 적용 후 읽기 검증

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'normalized_customers'
  and column_name in ('latitude', 'longitude', 'geocode_accuracy', 'geocoded_at', 'geocoded_address')
order by column_name;

select count(*) as existing_rows,
       count(*) filter (
         where num_nonnulls(latitude, longitude, geocode_accuracy, geocoded_at, geocoded_address) > 0
       ) as changed_existing_rows
from public.normalized_customers;

select relrowsecurity, relforcerowsecurity, relacl
from pg_class
where oid = 'public.normalized_customers'::regclass;

select polname, polcmd, polroles, polqual, polwithcheck
from pg_policy
where polrelid = 'public.normalized_customers'::regclass
order by polname;

select action, target_type, metadata, created_at
from public.admin_audit_logs
where action = 'customer_coordinates_schema_added'
order by created_at desc
limit 1;
```

`changed_existing_rows = 0`이어야 하며 RLS·정책·권한 결과는 적용 전과 같아야 한다.

## 승인 질문 B — 기존 리드 좌표 백필(별도, 이번 up에 미포함)

전환된 리드와 거래처의 연결 기준, 중복 연결 처리, 주소 변경 여부를 먼저 읽기 확정한 뒤 `lead` 좌표를 채울 것인가?

- 질문 A 승인과 독립적으로 결정한다. 질문 A만 승인하면 백필은 0건이다.
- 백필 SQL은 현재 초안에 포함하지 않았다. 연결 관계와 예상 영향 행 수를 별도 읽기 조회로 검토한 뒤 별도 SQL·감사 기록·down 계획으로 다시 승인받는다.
- `business_permit_leads`의 좌표가 한국 범위 안이고 위도·경도가 모두 있을 때만 후보로 삼는다.
- 주소 문자열만으로 임의 결합하지 않는다. 하나의 거래처에 여러 리드가 연결되거나 기존 좌표가 있으면 자동 갱신하지 않는다.

## down과 되돌리기 제약

- 후속 앱 기능을 먼저 끄고 앱을 이 스키마 이전 버전으로 되돌린 뒤 별도 승인을 받는다.
- 다섯 칸 중 하나라도 값이 있는 행이 있으면 down은 의도적으로 실패한다. 값을 자동 삭제하지 않는다.
- 값이 0건일 때만 down을 실행한다. down도 감사 기록을 남긴 뒤 제약과 칸을 제거한다.
- 좌표 값이 생긴 뒤의 복구는 대상 회사·거래처와 보존 위치를 읽기 확정한 수동 계획이 필요하다.

## 화면 확인

- 변경 화면: 없음(SQL 초안·시험·승인표만).
- 실제 화면: 확인 못 함. 앱 배포는 이번 작업 범위가 아니다.
