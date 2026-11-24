-- CX-140 ① PG17: 운영과 같은 열을 가진 합성 표
\set ON_ERROR_STOP on
begin;
create table public.pricing_document_share_links(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_id uuid not null,
  lead_id uuid, send_id uuid, revoked_at timestamptz, expires_at timestamptz not null default clock_timestamp() + interval '30 days');
-- 가드 시험용: 활성 공개 링크가 같은 문서에 2개
insert into public.pricing_document_share_links(company_id, document_id, lead_id) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null);
commit;

-- 활성 중복이 있으면 적용이 중단되고 인덱스가 생기지 않는다
\set ON_ERROR_STOP off
\ir 2026-11-24-CX-140-public-link-unique.sql
rollback;
\set ON_ERROR_STOP on
do $g$ begin
  if exists (select 1 from pg_indexes where indexname = 'pricing_public_share_link_one_per_document_uq') then raise exception 'guard_failed_index_created'; end if;
end $g$;

-- 운영 상태: 공개 링크는 모두 회수됨(행은 남아 있음), 리드 링크 2개
begin;
update public.pricing_document_share_links set revoked_at = clock_timestamp();
insert into public.pricing_document_share_links(company_id, document_id, lead_id) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2');
commit;

\ir 2026-11-24-CX-140-public-link-unique.sql

do $t$
declare c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  d1 uuid := '00000000-0000-0000-0000-0000000000d1'; d2 uuid := '00000000-0000-0000-0000-0000000000d2';
  blocked boolean;
begin
  -- 회수된 링크가 있어도 새 공개 링크 1개는 만들 수 있다
  insert into public.pricing_document_share_links(company_id, document_id) values (c1, d1);
  -- 같은 문서에 활성 공개 링크가 있으면 두 번째는 막힌다
  blocked := false;
  begin insert into public.pricing_document_share_links(company_id, document_id) values (c1, d1);
  exception when unique_violation then blocked := true; end;
  if not blocked then raise exception 'duplicate_public_allowed'; end if;
  -- 저장된 만료일이 지나도(회수 전) 새 링크를 막는다: 만료는 head 버전을 따라 연장되므로 "회수한 뒤에만" 새로 만든다
  update public.pricing_document_share_links set expires_at = clock_timestamp() - interval '1 day' where company_id = c1 and document_id = d1 and lead_id is null and revoked_at is null;
  blocked := false;
  begin insert into public.pricing_document_share_links(company_id, document_id) values (c1, d1);
  exception when unique_violation then blocked := true; end;
  if not blocked then raise exception 'expired_but_unrevoked_must_block'; end if;
  -- 만료일을 연장(head 따라감)해도 같은 링크 1개 그대로
  update public.pricing_document_share_links set expires_at = clock_timestamp() + interval '400 days' where company_id = c1 and document_id = d1 and lead_id is null and revoked_at is null;
  if (select count(*) from public.pricing_document_share_links where company_id = c1 and document_id = d1 and lead_id is null and revoked_at is null) <> 1 then raise exception 'one_active'; end if;
  -- 회수하면 새로 만들 수 있다
  update public.pricing_document_share_links set revoked_at = clock_timestamp() where company_id = c1 and document_id = d1 and lead_id is null and revoked_at is null;
  insert into public.pricing_document_share_links(company_id, document_id) values (c1, d1);
  -- 리드별 링크는 여러 개 허용(같은 문서·같은 리드도)
  insert into public.pricing_document_share_links(company_id, document_id, lead_id) values (c1, d1, '00000000-0000-0000-0000-0000000000e3');
  insert into public.pricing_document_share_links(company_id, document_id, lead_id) values (c1, d1, '00000000-0000-0000-0000-0000000000e3');
  -- 다른 문서·다른 회사는 각자 1개
  insert into public.pricing_document_share_links(company_id, document_id) values (c1, d2);
  insert into public.pricing_document_share_links(company_id, document_id) values (c2, d1);
  blocked := false;
  begin insert into public.pricing_document_share_links(company_id, document_id) values (c2, d1);
  exception when unique_violation then blocked := true; end;
  if not blocked then raise exception 'second_in_company2_allowed'; end if;
end $t$;

-- down: 인덱스만 사라지고 링크는 그대로, 이후 중복 생성이 다시 가능
select count(*) as links_before_down from public.pricing_document_share_links \gset
\ir 2026-11-24-CX-140-public-link-unique.down.sql
do $d$ begin
  if exists (select 1 from pg_indexes where indexname = 'pricing_public_share_link_one_per_document_uq') then raise exception 'down_index_remains'; end if;
  insert into public.pricing_document_share_links(company_id, document_id) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1');
end $d$;
select (select count(*) from public.pricing_document_share_links) = :links_before_down + 1 as ok \gset
\if :ok
\else
  do $x$ begin raise exception 'down_changed_rows'; end $x$;
\endif
