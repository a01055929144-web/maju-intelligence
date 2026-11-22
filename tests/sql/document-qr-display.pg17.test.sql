\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'document_qr_display_test' or current_setting('server_version_num')::integer/10000<>17
    then raise exception 'disposable_qr_display_pg17_required'; end if;
end $$;
-- Reuse the actual approved VAT/footer cleaner and real save/publish fixture.
\ir document-vat-contract.pg17.test.sql
create temporary table qr_cleaner_before as select oid,proowner,proacl,prosecdef,md5(pg_get_functiondef(oid)) hash from pg_proc where oid='public.pricing_p1_clean(uuid,jsonb)'::regprocedure;
create temporary table qr_versions_before as select id,content from public.pricing_document_versions;
\ir ../../docs/sql-drafts/2026-11-22-CX-128-document-qr-display.sql
do $$ begin
  assert public.pricing_document_qr_display_contract_v1()=1,'capability missing';
  assert exists(select 1 from qr_cleaner_before b join pg_proc p using(oid) where b.proowner=p.proowner and b.proacl is not distinct from p.proacl and b.prosecdef=p.prosecdef),'cleaner OID/owner/ACL changed';
  assert not has_function_privilege('anon','public.pricing_document_qr_display_contract_v1()','execute'),'anonymous capability';
  assert not has_function_privilege('authenticated','public.pricing_p1_clean(uuid,jsonb)','execute'),'browser cleaner';
end $$;
\ir ../../docs/sql-drafts/2026-11-22-CX-128-document-qr-display.down.sql
do $$ begin
  assert (select hash from qr_cleaner_before)=md5(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure)),'down changed cleaner';
end $$;
\ir ../../docs/sql-drafts/2026-11-22-CX-128-document-qr-display.sql
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; d public.pricing_documents; input jsonb; baseline jsonb; cleaned jsonb; saved jsonb; pos text; size text;
begin
  select * into d from public.pricing_documents where company_id=c order by id limit 1;
  assert d.id is not null,'fixture missing';
  baseline:=public.pricing_p1_clean_before_qr_display_v1(c,d.content);
  for pos in select unnest(array['bottom-left','bottom-right','top-right','top-left']) loop
    for size in select unnest(array['small','normal','large']) loop
      input:=jsonb_set(d.content,'{display}',coalesce(d.content->'display','{}'::jsonb)||jsonb_build_object('qr',jsonb_build_object('position',pos,'size',size)));
      cleaned:=public.pricing_p1_clean(c,input);
      assert (cleaned#>'{display,qr}')=jsonb_build_object('position',pos,'size',size),'QR lost';
      assert cleaned#-'{display,qr}'=baseline,'non-QR validator output changed';
    end loop;
  end loop;
  begin
    perform public.pricing_p1_clean(c,jsonb_set(input,'{display,qr}','{"position":"absolute","size":"9999"}'::jsonb));
    raise exception 'invalid QR accepted';
  exception when others then if sqlerrm<>'invalid_document_qr_display' then raise; end if; end;
  -- Ordinary save must retain the settings without publishing or changing existing versions.
  saved:=public.pricing_p1(c,d.owner_key,true,'save',jsonb_build_object('id',d.id,'expected',d.revision,'content',input));
  assert saved#>'{content,display,qr}'=input#>'{display,qr}','normal save dropped QR';
  assert saved#>'{content,lines}'=baseline->'lines','price/tax contract changed';
  assert (select count(*) from public.pricing_document_versions)=(select count(*) from qr_versions_before),'new publication';
  assert not exists(select 1 from qr_versions_before old join public.pricing_document_versions v using(id) where old.content is distinct from v.content),'old version changed';
end $$;
set role service_role;
select public.pricing_document_qr_display_contract_v1();
reset role;
\! if psql -X --dbname="$DOCUMENT_QR_TEST_DATABASE" --set=ON_ERROR_STOP=1 --file=docs/sql-drafts/2026-11-22-CX-128-document-qr-display.down.sql >/tmp/qr-display-refused-down.log 2>&1; then exit 1; fi; grep -q qr_display_down_refused_contract_in_use /tmp/qr-display-refused-down.log
select 1 / (not :'SHELL_ERROR'::boolean)::integer as expected_qr_down_refusal;
do $$ begin
  assert public.pricing_document_qr_display_contract_v1()=1,'refused down changed contract';
  assert exists(select 1 from public.pricing_documents where content#>'{display,qr}' is not null),'refused down lost QR';
end $$;
select 'QR_DISPLAY_PG17_PASS';
