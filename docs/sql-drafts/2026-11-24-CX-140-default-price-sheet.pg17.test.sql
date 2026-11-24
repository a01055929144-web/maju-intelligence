-- CX-140 ③ PG17
\set ON_ERROR_STOP on
begin;
create table public.companies(id uuid primary key);
create table public.pricing_documents(id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade, unique(company_id, id));
create role service_role nologin; create role anon nologin; create role authenticated nologin;
insert into public.companies values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.pricing_documents values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c2');
commit;

\ir 2026-11-24-CX-140-default-price-sheet.sql

do $t$
declare ok boolean;
begin
  if (select count(*) from public.pricing_default_public_documents) <> 0 then raise exception 'must_start_empty'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.pricing_default_public_documents'::regclass) then raise exception 'rls_off'; end if;
  if has_table_privilege('anon', 'public.pricing_default_public_documents', 'select') then raise exception 'anon_can_read'; end if;
  insert into public.pricing_default_public_documents(company_id, document_id, set_by_key)
    values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1', repeat('a', 64));
  -- 회사당 1개: 다시 지정하면 upsert로 바뀜
  insert into public.pricing_default_public_documents(company_id, document_id, set_by_key)
    values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1', repeat('b', 64))
    on conflict (company_id) do update set set_by_key = excluded.set_by_key;
  if (select count(*) from public.pricing_default_public_documents) <> 1 then raise exception 'one_per_company'; end if;
  -- 다른 회사 문서는 지정할 수 없다
  ok := false;
  begin insert into public.pricing_default_public_documents(company_id, document_id, set_by_key)
    values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2', repeat('a', 64));
  exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'cross_company_document'; end if;
  -- 형식이 틀린 지정자 키 거부
  ok := false;
  begin insert into public.pricing_default_public_documents(company_id, document_id, set_by_key)
    values ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000d2', 'bad');
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'bad_actor_key'; end if;
  -- 문서가 지워지면 포인터도 함께 사라진다
  delete from public.pricing_documents where id = '00000000-0000-0000-0000-0000000000d1';
  if (select count(*) from public.pricing_default_public_documents) <> 0 then raise exception 'cascade'; end if;
end $t$;

\ir 2026-11-24-CX-140-default-price-sheet.down.sql
do $d$ begin
  if to_regclass('public.pricing_default_public_documents') is not null then raise exception 'down_table_remains'; end if;
  if (select count(*) from public.pricing_documents) <> 1 then raise exception 'down_touched_documents'; end if;
end $d$;
