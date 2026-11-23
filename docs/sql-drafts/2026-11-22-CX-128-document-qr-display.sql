-- DRAFT ONLY. Preserve QR metadata during later normal saves; never edits stored rows.
-- Requires the approved display/footer/VAT cleaner. Operating application is separate.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $$ begin
  if to_regprocedure('public.pricing_p1_clean_before_qr_display_v1(uuid,jsonb)') is not null
    or exists(select 1 from pg_proc where oid='public.pricing_p1_clean(uuid,jsonb)'::regprocedure and (prosecdef or provolatile<>'s'))
    or has_function_privilege('anon','public.pricing_p1_clean(uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.pricing_p1_clean(uuid,jsonb)','execute')
    or position('footerFontSize' in pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure))=0
    then raise exception 'qr_display_cleaner_prerequisite_required'; end if;
end $$;
-- Copy the current implementation; replace the original OID so cached callers use the wrapper.
do $$ begin
  execute replace(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure),
    'FUNCTION public.pricing_p1_clean(', 'FUNCTION public.pricing_p1_clean_before_qr_display_v1(');
end $$;
create or replace function public.pricing_p1_clean(p_company uuid,p_content jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
declare cleaned jsonb; qr jsonb:=p_content#>'{display,qr}';
begin
  cleaned:=public.pricing_p1_clean_before_qr_display_v1(p_company,p_content);
  if qr is null then return cleaned; end if;
  if jsonb_typeof(qr)<>'object' or coalesce(qr->>'position','') not in ('bottom-left','bottom-right','top-right','top-left')
    or coalesce(qr->>'size','') not in ('small','normal','large') then raise exception 'invalid_document_qr_display'; end if;
  return jsonb_set(cleaned,'{display}',coalesce(cleaned->'display','{}'::jsonb)||jsonb_build_object('qr',jsonb_build_object('position',qr->>'position','size',qr->>'size')));
end $$;
create function public.pricing_document_qr_display_contract_v1() returns integer
language sql stable security invoker set search_path=pg_catalog,public,pg_temp as $$
  select case when to_regprocedure('public.pricing_p1_clean_before_qr_display_v1(uuid,jsonb)') is not null
    and position('pricing_p1_clean_before_qr_display_v1' in pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure))>0 then 1 else 0 end
$$;
revoke all on function public.pricing_p1_clean_before_qr_display_v1(uuid,jsonb), public.pricing_document_qr_display_contract_v1() from public,anon,authenticated,service_role;
grant execute on function public.pricing_p1_clean_before_qr_display_v1(uuid,jsonb), public.pricing_document_qr_display_contract_v1() to service_role;
notify pgrst,'reload schema';
commit;
