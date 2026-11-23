-- CX-121 company-common extension rollback draft.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.pricing_document_extension_review_customer_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text)') is null
    then raise exception 'cx121_common_not_applied'; end if;
  if exists(select 1 from public.pricing_document_extension_states where customer_id is null)
    then raise exception 'cx121_common_down_active_state'; end if;
end $$;

drop function public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text);
drop function public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]);
drop function public.pricing_document_extension_review_common_keep_v1(uuid,text,boolean,uuid,integer,date,text,jsonb,text);
drop function public.pricing_document_extension_policy_v1(uuid,text,boolean,uuid);
drop function public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb);

alter function public.pricing_document_extension_review_customer_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text)
  rename to pricing_document_extension_review_v1;
alter function public.pricing_document_extension_catalog_customer_v1(uuid,text,boolean,uuid,integer,text,uuid[])
  rename to pricing_document_extension_catalog_v1;
alter function public.pricing_document_extension_price_fingerprint_customer_v1(uuid,uuid,jsonb)
  rename to pricing_document_extension_price_fingerprint_v1;
alter table public.pricing_document_extension_states alter column customer_id set not null;

revoke all on function public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb),
  public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text),
  public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]) to service_role;
commit;
