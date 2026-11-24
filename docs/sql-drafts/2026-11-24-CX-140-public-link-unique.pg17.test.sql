-- CX-140 ① PG17: 운영과 같은 열을 가진 합성 표
\set ON_ERROR_STOP on
begin;
create table public.pricing_document_share_links(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_id uuid not null,
  lead_id uuid, send_id uuid, revoked_at timestamptz, expires_at timestamptz not null default clock_timestamp() + interval '30 days');
-- 트리거 적용 전부터 있던 중복 공개 링크 3개(이번 달 단가표) + 리드 링크 2개
insert into public.pricing_document_share_links(id, company_id, document_id, lead_id) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null),
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e2');
commit;

\ir 2026-11-24-CX-140-public-link-unique.sql

do $t$
declare c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  d1 uuid := '00000000-0000-0000-0000-0000000000d1'; d2 uuid := '00000000-0000-0000-0000-0000000000d2';
  blocked boolean;
begin
  -- 기존 중복 3개는 그대로(끊지도 지우지도 않음)
  if (select count(*) from public.pricing_document_share_links where lead_id is null and revoked_at is null) <> 3 then raise exception 'existing_changed'; end if;
  -- 기존 행 update(예: 조회수·회수)는 트리거가 보지 않음
  update public.pricing_document_share_links set revoked_at = null where id = '00000000-0000-0000-0000-0000000000a2';

  -- 같은 문서에 활성 공개 링크가 있으면 새로 만들 수 없다
  blocked := false;
  begin insert into public.pricing_document_share_links(company_id, document_id) values (c1, d1);
  exception when unique_violation then blocked := true; end;
  if not blocked then raise exception 'duplicate_public_allowed'; end if;

  -- 리드별 링크는 여러 개 허용(같은 문서·같은 리드도, 다른 리드도)
  insert into public.pricing_document_share_links(company_id, document_id, lead_id) values (c1, d1, '00000000-0000-0000-0000-0000000000e3');
  insert into public.pricing_document_share_links(company_id, document_id, lead_id) values (c1, d1, '00000000-0000-0000-0000-0000000000e3');
  -- 다른 문서·다른 회사는 각자 1개
  insert into public.pricing_document_share_links(company_id, document_id) values (c1, d2);
  insert into public.pricing_document_share_links(company_id, document_id) values (c2, d1);
  blocked := false;
  begin insert into public.pricing_document_share_links(company_id, document_id) values (c2, d1);
  exception when unique_violation then blocked := true; end;
  if not blocked then raise exception 'second_in_company2_allowed'; end if;

  -- 회수·만료된 링크만 있으면 새로 만들 수 있다
  update public.pricing_document_share_links set revoked_at = clock_timestamp() where company_id = c1 and document_id = d2 and lead_id is null;
  insert into public.pricing_document_share_links(company_id, document_id) values (c1, d2);
  update public.pricing_document_share_links set expires_at = clock_timestamp() - interval '1 day' where company_id = c1 and document_id = d2 and revoked_at is null;
  insert into public.pricing_document_share_links(company_id, document_id) values (c1, d2);
end $t$;

-- down: 트리거·함수만 사라지고 링크는 그대로, 이후 중복 생성이 다시 가능
\ir 2026-11-24-CX-140-public-link-unique.down.sql
do $d$ begin
  if to_regprocedure('public.pricing_public_share_link_unique_v1()') is not null then raise exception 'down_function_remains'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.pricing_document_share_links'::regclass and tgname = 'pricing_public_share_link_unique') then raise exception 'down_trigger_remains'; end if;
  if (select count(*) from public.pricing_document_share_links where lead_id is null and revoked_at is null and document_id = '00000000-0000-0000-0000-0000000000d1' and company_id = '00000000-0000-0000-0000-0000000000c1') <> 3 then raise exception 'down_changed_rows'; end if;
  insert into public.pricing_document_share_links(company_id, document_id) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1');
end $d$;
