-- visit_results.lead_id 컬럼과 lead_recommendations로의 외래키가 없는 환경(기존 운영 DB)에서
-- getVisitTimeline()의 PostgREST embedded resource 조회(visit_results?select=...,lead_recommendations(...))가
-- PGRST200 "Could not find a relationship" 오류로 실패하는 문제를 해결합니다.
-- 컬럼/제약조건이 이미 있으면 아무 것도 하지 않도록 방어적으로 작성했습니다.

alter table public.visit_results
  add column if not exists lead_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'visit_results'
      and c.contype = 'f'
      and c.conname = 'visit_results_lead_id_fkey'
  ) then
    alter table public.visit_results
      add constraint visit_results_lead_id_fkey
      foreign key (lead_id) references public.lead_recommendations(id) on delete set null;
  end if;
end $$;

-- 스키마 변경 후 PostgREST가 관계 캐시를 다시 읽도록 알립니다.
notify pgrst, 'reload schema';
