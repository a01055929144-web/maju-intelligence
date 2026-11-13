# 매입일자 v2 운영 적용 체크리스트

상태: **운영 SQL 적용 완료 / 기능 OFF / 데이터 미작성 / 재실행 금지**

적용 기록: `20261107163553 purchase_cost_date_v2_20261108`. 승인 원문은 `supabase/migrations/20261107163553_purchase_cost_date_v2_20261108.sql`에 보존합니다. 운영 DB에는 이 SQL을 다시 실행하지 않습니다.

검토 기준은 Draft PR #333의 커밋 `6fa8650`이며, 적용 SQL SHA-256은 `E9FEF5973C8B0AEE3957898619AC73B762455007A62E5FAB44B3A9F8E3958309`입니다. 커밋이나 해시가 달라지면 이 체크리스트를 다시 검토합니다.

## 1. 적용 직전 읽기 점검

아래 쿼리는 읽기 전용입니다. 하나라도 기대와 다르면 적용을 중단합니다.

```sql
select current_database(), current_setting('server_version');

select to_regclass('public.product_catalog') product_catalog,
       to_regclass('public.purchase_receipt_lines') purchase_receipt_lines,
       to_regclass('public.price_recalc_runs') price_recalc_runs,
       to_regprocedure('public.pricing_p0_command(uuid,jsonb)') pricing_p0_command;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='product_catalog'
  and column_name in ('company_id','id','purchase_price','updated_at')
order by column_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='purchase_receipt_lines'
  and column_name in ('company_id','receipt_date','product_catalog_id','source_row_number')
order by column_name;

select has_function_privilege('service_role','public.pricing_p0_command(uuid,jsonb)','execute') service_can_recalculate,
       has_function_privilege('anon','public.pricing_p0_command(uuid,jsonb)','execute') anon_can_recalculate,
       has_function_privilege('authenticated','public.pricing_p0_command(uuid,jsonb)','execute') user_can_recalculate;

select count(*) filter(where purchase_price=0) zero_price,
       count(*) filter(where purchase_price>0) priced,
       count(*) total
from public.product_catalog;

select to_regclass('public.purchase_cost_date_batches_v2') existing_batch_table,
       to_regprocedure('public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)') existing_save,
       to_regprocedure('public.restore_purchase_cost_date_batch_v2(uuid,uuid,text)') existing_restore;
```

기대값:

- PostgreSQL 버전과 대상 프로젝트가 승인 요청과 일치한다.
- 세 의존 객체와 `pricing_p0_command`가 모두 존재한다.
- `purchase_price`는 `numeric`, `NOT NULL`, 기본값 0이다.
- `service_role`만 가격 재계산 함수를 실행하고 `anon`·`authenticated`는 실행하지 못한다.
- v2 객체가 없거나, 이미 있다면 승인된 동일 버전임을 별도 diff로 확인한다. 일부 객체만 존재하면 중단한다.
- 적용 전 DB 백업·복구 지점과 담당자·적용 창이 기록돼 있어야 한다.

## 2. 즉시 중단 조건

- 프로젝트 ID, DB 이름, 서버 버전 또는 SQL SHA-256이 승인 내용과 다르다.
- 기존 v2 테이블·함수·트리거가 일부만 존재하거나 정의가 Draft와 다르다.
- `product_catalog.purchase_price` 또는 receipt/가격 재계산 의존 스키마가 기대와 다르다.
- `anon` 또는 `authenticated`에 가격 재계산 실행 권한이 있다.
- 백업·복구 담당자, 적용 승인 문구, 장애 시 중단 연락처 중 하나라도 없다.
- 적용 도중 첫 오류가 발생한다. 오류를 무시하고 나머지 구문을 실행하지 않는다.

## 3. 승인 후 적용 규칙

1. 사용자가 운영 프로젝트와 SQL 해시를 명시 승인한다.
2. 백업·복구 지점을 확인한다.
3. `ON_ERROR_STOP`에 해당하는 설정으로 승인된 SQL 전체를 한 번 실행한다.
4. 오류가 나면 트랜잭션을 종료하고 재실행하지 않는다. 원인을 확인한 새 Draft와 새 승인을 받는다.
5. 이 단계에서는 실제 매입 파일이나 합성 배치를 운영 DB에 쓰지 않는다. 데이터 쓰기 스모크는 별도 승인이다.

## 4. 적용 직후 읽기 검증

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='product_catalog'
  and column_name='purchase_price_date';

select c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
where c.conrelid='public.purchase_cost_date_batches_v2'::regclass
order by c.conname;

select relname, relrowsecurity
from pg_class
where oid in ('public.purchase_cost_date_batches_v2'::regclass,
              'public.purchase_receipt_lines'::regclass);

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid='public.product_catalog'::regclass and not tgisinternal
  and tgname='guard_purchase_price_date_v2';

select to_regprocedure('public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)') save_rpc,
       to_regprocedure('public.restore_purchase_cost_date_batch_v2(uuid,uuid,text)') restore_rpc;

select has_function_privilege('service_role','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute') service_save,
       has_function_privilege('service_role','public.restore_purchase_cost_date_batch_v2(uuid,uuid,text)','execute') service_restore,
       has_function_privilege('anon','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute') anon_save,
       has_function_privilege('authenticated','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute') user_save;

select count(*) from public.purchase_cost_date_batches_v2;
```

기대값:

- `purchase_price_date date`와 v2 배치 테이블·두 RPC·보호 트리거가 존재한다.
- 배치 테이블 RLS가 켜져 있고 receipt 테이블의 기존 RLS도 유지된다.
- 저장·복구 RPC는 `service_role`만 실행하며 공개 역할은 실행하지 못한다.
- 적용 직후 배치 수는 0이다. 값이 있으면 예상치 못한 호출이므로 기능을 켜지 않고 조사한다.
- 기존 상품의 금액·날짜·`updated_at`, receipt 수, 가격 재계산 run 수가 적용 전 읽기 기준과 같아야 한다. DDL 적용만으로 데이터가 바뀌면 실패다.

## 5. 별도 승인 후 데이터 검증

운영 또는 승인된 스테이징에서 실제 파일을 쓰는 검증은 다음을 모두 남깁니다.

- 업로드 원문 3,417행, 고유 가격 후보 약 745개, 상이 단가 충돌 188개, 빈 단위 1,552행의 파서 집계.
- 저장 응답의 `rowCount`, `historyOnlyProductCount`, `recalcRunId`, `status`와 DB receipt/history/current-price 건수 대조.
- 같은 batch/body 재시도 시 행 증가 없음, 같은 batch/다른 body 실패.
- 저장 후 새로고침·재로그인 뒤 날짜별 이력과 판매가가 동일함.
- 최신 배치 복구 후 다시 새로고침해 원가·판매가·receipt/history가 함께 복구됨.
- 다른 회사의 상품·공급처 ID를 섞은 요청이 전체 실패하고 양쪽 회사 데이터가 변하지 않음.

## 6. A 단계 100% 판정 구분

| 증거 | 현재 상태 | 100%에 필요한 추가 증거 |
|---|---|---|
| PG17 SQL 계약 | 통과 | 없음 |
| 3,417행·745상품 합성 저장 | 통과 | 실제 대표 파일 파서·DB 대조 |
| 188 충돌·빈 단위 1,552행 | SQL은 허용, 대표 분포 미검증 | 실제 파일 최종 확인·저장 증거 |
| 원자 재계산·복구·멱등 | PG17 통과 | 앱 호출 후 새로고침·재로그인 복구 |
| 회사 격리 | PG17 통과 | 승인 환경에서 실제 인증·회사 범위 증거 |
| 운영 적용 | 완료, 기능 OFF | 없음. 운영 재실행 금지; 데이터 검증은 별도 승인 필요 |

위 마지막 열이 모두 채워지기 전에는 A 단계를 100%로 표시하지 않습니다.

## 7. 운영 적용 결과

- 승인 적용: `20261107163553 purchase_cost_date_v2_20261108`
- 적용 직후 상품 748개, 양수 가격 748개, 기존 가격 날짜 null 748개, 새 v2 배치 0개.
- v2 배치 테이블, 저장·복구 RPC, 보호 트리거, 인덱스 2개, FK가 존재합니다.
- 배치 테이블 RLS는 켜져 있고 `service_role`만 RPC 실행과 테이블 접근이 가능하며 `anon`·`authenticated`는 불가합니다.
- 보안 advisor의 RLS 정책 없음 INFO는 서비스 전용 테이블의 의도된 구성입니다.
- `recalc_run_id` FK 인덱스 없음은 후속 성능 검토 항목이며 이번 적용본을 재실행하거나 운영 DB를 추가 변경하는 근거가 아닙니다.
- 기능 플래그는 OFF이고 운영 데이터 쓰기 검증은 수행하지 않았습니다.
