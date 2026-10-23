-- 운영 적용 완료(2026-10-23). 재실행 금지.
begin;

create table if not exists public.lead_fingerprint_backfill_log (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  fingerprint text not null check(length(fingerprint) between 1 and 500),
  filled_at timestamptz not null default now(),
  constraint lead_fingerprint_backfill_log_lead_fk
    foreign key(company_id,lead_id)
    references public.business_permit_leads(company_id,id)
    on delete cascade,
  constraint lead_fingerprint_backfill_log_batch_lead_uq unique(batch_id,lead_id)
);

create index if not exists lead_fingerprint_backfill_log_company_batch_idx
  on public.lead_fingerprint_backfill_log(company_id,batch_id,filled_at);

alter table public.lead_fingerprint_backfill_log enable row level security;
revoke all on table public.lead_fingerprint_backfill_log from public,anon,authenticated;
grant select,insert,delete on table public.lead_fingerprint_backfill_log to service_role;

commit;

-- 배치 롤백(별도 승인 후 실행): 로그에 기록된 당시 값과 현재 값이 같은 행만 null로 되돌립니다.
-- begin;
-- update public.business_permit_leads lead
-- set canonical_fingerprint=null
-- from public.lead_fingerprint_backfill_log log
-- where log.batch_id=:batch_id
--   and lead.company_id=log.company_id and lead.id=log.lead_id
--   and lead.canonical_fingerprint=log.fingerprint;
-- delete from public.lead_fingerprint_backfill_log where batch_id=:batch_id;
-- commit;
