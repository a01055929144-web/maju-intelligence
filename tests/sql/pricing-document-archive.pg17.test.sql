\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.companies(id uuid primary key);
insert into public.companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
create table public.pricing_documents(id uuid primary key,company_id uuid references public.companies,owner_key text,kind text,revision integer,content jsonb,updated_at timestamptz default now(),unique(company_id,id));
create table public.pricing_document_versions(id uuid primary key,company_id uuid,document_id uuid,content jsonb,foreign key(company_id,document_id) references public.pricing_documents(company_id,id) on delete cascade);
create table public.storefront_links(id uuid primary key,document_version_id uuid references public.pricing_document_versions(id) on delete no action);
create table public.store_orders(id uuid primary key,document_version_id uuid references public.pricing_document_versions(id) on delete no action);
insert into public.pricing_documents values ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('a',64),'quote',1,'{"price":1200}',now()),('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',repeat('a',64),'sheet',1,'{"price":1300}',now());
insert into public.pricing_document_versions values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"price":1200}');
insert into public.storefront_links values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into public.store_orders values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
\ir ../../docs/sql-drafts/20261106-pricing-document-archive.sql
do $$ declare c uuid:='00000000-0000-4000-8000-000000000001'; d uuid:='10000000-0000-4000-8000-000000000001'; begin
  if exists(select from public.pricing_documents where archived_at is not null) then raise exception 'default not active'; end if;
  if has_function_privilege('anon','public.set_pricing_document_archived(uuid,text,boolean,uuid,integer,boolean)','execute') or has_function_privilege('authenticated','public.set_pricing_document_archived(uuid,text,boolean,uuid,integer,boolean)','execute') then raise exception 'public execute'; end if;
  begin perform public.set_pricing_document_archived(c,repeat('b',64),true,d,1,true); raise exception 'foreign author allowed'; exception when raise_exception then if sqlerrm<>'Document not found' then raise; end if; end;
  begin perform public.set_pricing_document_archived('00000000-0000-4000-8000-000000000002',repeat('a',64),true,d,1,true); raise exception 'foreign company allowed'; exception when raise_exception then if sqlerrm<>'Document not found' then raise; end if; end;
  begin perform public.set_pricing_document_archived(c,repeat('a',64),false,'10000000-0000-4000-8000-000000000002',1,true); raise exception 'nonmanager sheet allowed'; exception when raise_exception then if sqlerrm<>'Document not found' then raise; end if; end;
  begin perform public.set_pricing_document_archived(c,repeat('a',64),false,d,2,true); raise exception 'stale allowed'; exception when raise_exception then if sqlerrm<>'Stale document' then raise; end if; end;
  perform public.set_pricing_document_archived(c,repeat('a',64),false,d,1,true);
  if not exists(select from public.pricing_documents where id=d and archived_at is not null and revision=2 and content='{"price":1200}') then raise exception 'archive failed'; end if;
  begin update public.pricing_documents set content='{"price":999}' where id=d; raise exception 'archived edit allowed'; exception when raise_exception then if sqlerrm<>'Archived document' then raise; end if; end;
  begin insert into public.pricing_document_versions values ('20000000-0000-4000-8000-000000000002',c,d,'{}'); raise exception 'archived publish allowed'; exception when raise_exception then if sqlerrm<>'Archived document' then raise; end if; end;
  if (select count(*) from public.pricing_document_versions)<>1 or (select count(*) from public.storefront_links)<>1 or (select count(*) from public.store_orders)<>1 then raise exception 'published references changed'; end if;
  perform public.set_pricing_document_archived(c,repeat('a',64),false,d,2,false);
  if not exists(select from public.pricing_documents where id=d and archived_at is null and revision=3) then raise exception 'restore failed'; end if;
  update public.pricing_documents set content='{"price":1250}' where id=d;
  if not exists(select from public.pricing_document_versions where content='{"price":1200}') then raise exception 'snapshot changed'; end if;
end $$;
\ir ../../docs/sql-drafts/20261106-pricing-document-archive.down.sql
\ir ../../docs/sql-drafts/20261106-pricing-document-archive.sql
do $$ begin
 if (select count(*) from public.pricing_documents)<>2 or (select count(*) from public.storefront_links)<>1 or (select count(*) from public.store_orders)<>1 then raise exception 'down lost data'; end if;
end $$;
select 'pricing_document_archive_pg17_pass';
