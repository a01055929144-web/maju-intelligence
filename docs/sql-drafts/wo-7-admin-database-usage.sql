-- 운영 적용 완료(2026-10-26). 재실행 금지. WO-7 시스템 관리자 DB 용량 조회.
begin;
create or replace function public.admin_database_usage()
returns jsonb
language sql
security invoker
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'measured_at', now(),
    'largest_tables', coalesce((
      select jsonb_agg(jsonb_build_object('schema', schemaname, 'table', relname, 'bytes', total_bytes) order by total_bytes desc)
      from (
        select n.nspname schemaname, c.relname, pg_total_relation_size(c.oid) total_bytes
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where c.relkind='r' and n.nspname='public'
        order by total_bytes desc limit 10
      ) ranked
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.admin_database_usage() from public, anon, authenticated;
grant execute on function public.admin_database_usage() to service_role;
commit;
-- 롤백(별도 승인 후): drop function if exists public.admin_database_usage();
