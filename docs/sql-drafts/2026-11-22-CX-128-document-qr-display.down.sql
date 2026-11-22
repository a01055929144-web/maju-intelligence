-- DRAFT ONLY. Turn the company feature OFF first. Never deletes saved preferences.
begin;
set local lock_timeout='3s';
do $$ begin
  if exists(select 1 from public.pricing_documents where content#>'{display,qr}' is not null)
    or exists(select 1 from public.pricing_document_versions where content#>'{display,qr}' is not null)
    then raise exception 'qr_display_down_refused_contract_in_use'; end if;
end $$;
drop function public.pricing_document_qr_display_contract_v1();
do $$ begin
  execute replace(pg_get_functiondef('public.pricing_p1_clean_before_qr_display_v1(uuid,jsonb)'::regprocedure),
    'FUNCTION public.pricing_p1_clean_before_qr_display_v1(', 'FUNCTION public.pricing_p1_clean(');
end $$;
drop function public.pricing_p1_clean_before_qr_display_v1(uuid,jsonb);
notify pgrst,'reload schema';
commit;
