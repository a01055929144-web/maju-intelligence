-- 운영 적용 완료(2026-10-23). 실제 병합 실행 금지.
-- 1단계 스키마 운영 적용 승인(2026-10-23). 실제 병합 실행은 별도 승인 전 금지.
begin;

alter table public.business_permit_leads
  add column if not exists merged_into_lead_id uuid,
  add column if not exists merged_at timestamptz,
  add column if not exists merge_reason text,
  add column if not exists merge_batch_id uuid;

-- 제약 이름이 아니라 정확한 컬럼 집합(company_id,id)으로 기존 UNIQUE를 확인합니다.
do $$
declare has_company_id_unique boolean;
begin
  select exists (
    select 1
    from pg_constraint constraint_row
    join lateral (
      select array_agg(attribute_row.attname order by key_row.ordinality) as columns
      from unnest(constraint_row.conkey) with ordinality key_row(attnum, ordinality)
      join pg_attribute attribute_row
        on attribute_row.attrelid=constraint_row.conrelid and attribute_row.attnum=key_row.attnum
    ) key_columns on true
    where constraint_row.conrelid='public.business_permit_leads'::regclass
      and constraint_row.contype in ('p','u')
      and key_columns.columns=array['company_id','id']::name[]
  ) into has_company_id_unique;
  if not has_company_id_unique then
    alter table public.business_permit_leads
      add constraint business_permit_leads_company_id_id_uq unique(company_id,id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid='public.business_permit_leads'::regclass
      and conname='business_permit_leads_merged_into_fk') then
    alter table public.business_permit_leads
      add constraint business_permit_leads_merged_into_fk
      foreign key(company_id,merged_into_lead_id)
      references public.business_permit_leads(company_id,id)
      on delete no action deferrable initially deferred;
  end if;
end $$;

create table if not exists public.lead_merge_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'prepared' check(status in ('prepared','applied','rolled_back','failed')),
  reason text not null,
  prepared_by_name text,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_merge_batches_company_id_id_uq unique(company_id,id)
);

create table if not exists public.lead_merge_move_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  merge_batch_id uuid not null,
  table_name text not null check(table_name in ('lead_actions','lead_enrichment_events',
    'lead_business_hour_intervals','sales_quotes','business_permit_lead_source_records')),
  row_id uuid not null,
  original_lead_id uuid not null,
  representative_lead_id uuid not null,
  moved_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  constraint lead_merge_move_logs_batch_fk foreign key(company_id,merge_batch_id)
    references public.lead_merge_batches(company_id,id) on delete cascade,
  constraint lead_merge_move_logs_original_fk foreign key(company_id,original_lead_id)
    references public.business_permit_leads(company_id,id)
    on delete no action deferrable initially deferred,
  constraint lead_merge_move_logs_representative_fk foreign key(company_id,representative_lead_id)
    references public.business_permit_leads(company_id,id)
    on delete no action deferrable initially deferred,
  constraint lead_merge_move_logs_row_uq unique(merge_batch_id,table_name,row_id)
);

create index if not exists business_permit_leads_active_canonical_idx
  on public.business_permit_leads(company_id,canonical_fingerprint) where merged_into_lead_id is null;
create index if not exists lead_merge_move_logs_batch_idx
  on public.lead_merge_move_logs(company_id,merge_batch_id,table_name);
alter table public.lead_merge_batches enable row level security;
alter table public.lead_merge_move_logs enable row level security;
revoke all on table public.lead_merge_batches,public.lead_merge_move_logs from public,anon,authenticated;
grant select,insert,update on table public.lead_merge_batches,public.lead_merge_move_logs to service_role;
commit;

-- 상태 결정: raw_payload.lastModified(LAST_MDFCN_PNT/LASTMODTS 매핑값)를 정상 비교할 수 있으면
-- 가장 최신 출처 상태를 사용합니다. 영업·폐업이 섞이고 비교 시각이 없으면 자동 폐업하지 않고
-- 대표 상태를 '폐업 확인 필요'로 둡니다.

-- 병합 실행 템플릿(실행 금지)
-- 승인된 lead_merge_plan(company_id,losing_lead_id,representative_lead_id,merge_reason,
-- resolved_status)을 만든 뒤, 한 트랜잭션에서 배치 생성 → 아래 5개 테이블의 이동 대상 로그 INSERT
-- → lead_id UPDATE → losing lead의 병합 필드 기록 → batch applied 순으로 실행합니다.
-- 연결 테이블: lead_actions, lead_enrichment_events, lead_business_hour_intervals,
-- sales_quotes, business_permit_lead_source_records. UNIQUE 충돌이 하나라도 있으면 실행하지 않습니다.

-- 배치 단위 되돌리기 템플릿(실행 금지, 시간 범위 사용 금지)
-- begin;
-- update public.lead_actions t set lead_id=l.original_lead_id from public.lead_merge_move_logs l
-- where l.merge_batch_id=:batch_id and l.table_name='lead_actions' and t.id=l.row_id and l.rolled_back_at is null;
-- update public.lead_enrichment_events t set lead_id=l.original_lead_id from public.lead_merge_move_logs l
-- where l.merge_batch_id=:batch_id and l.table_name='lead_enrichment_events' and t.id=l.row_id and l.rolled_back_at is null;
-- update public.lead_business_hour_intervals t set lead_id=l.original_lead_id from public.lead_merge_move_logs l
-- where l.merge_batch_id=:batch_id and l.table_name='lead_business_hour_intervals' and t.id=l.row_id and l.rolled_back_at is null;
-- update public.sales_quotes t set lead_id=l.original_lead_id from public.lead_merge_move_logs l
-- where l.merge_batch_id=:batch_id and l.table_name='sales_quotes' and t.id=l.row_id and l.rolled_back_at is null;
-- update public.business_permit_lead_source_records t set lead_id=l.original_lead_id from public.lead_merge_move_logs l
-- where l.merge_batch_id=:batch_id and l.table_name='business_permit_lead_source_records' and t.id=l.row_id and l.rolled_back_at is null;
-- update public.business_permit_leads set merged_into_lead_id=null,merged_at=null,merge_reason=null,merge_batch_id=null
-- where merge_batch_id=:batch_id;
-- update public.lead_merge_move_logs set rolled_back_at=now() where merge_batch_id=:batch_id and rolled_back_at is null;
-- update public.lead_merge_batches set status='rolled_back',rolled_back_at=now()
-- where id=:batch_id and status='applied';
-- commit;
