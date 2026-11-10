-- DRAFT ONLY. Requires separate operating DB approval. Do not infer these fields for existing rows.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

alter table public.store_owner_activation_requests
  add column if not exists delivery_base_address text,
  add column if not exists delivery_address_detail text;
alter table public.normalized_customers
  add column if not exists delivery_base_address text,
  add column if not exists delivery_address_detail text;

alter table public.store_owner_activation_requests drop constraint if exists store_owner_activation_delivery_address_check;
alter table public.store_owner_activation_requests add constraint store_owner_activation_delivery_address_check check (
  (delivery_base_address is null and delivery_address_detail is null) or
  (length(btrim(delivery_base_address)) between 1 and 300 and length(btrim(delivery_address_detail)) between 1 and 100));
alter table public.normalized_customers drop constraint if exists normalized_customers_delivery_address_check;
alter table public.normalized_customers add constraint normalized_customers_delivery_address_check check (
  (delivery_base_address is null and delivery_address_detail is null) or
  (length(btrim(delivery_base_address)) between 1 and 300 and length(btrim(delivery_address_detail)) between 1 and 100));

create or replace function public.complete_public_store_owner_profile_v2(
  p_invite_token_hash text,p_store_name text,p_representative_name text,p_address text,p_base_address text,
  p_address_detail text,p_phone text,p_business_registration_number text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype;
  v_number text:=nullif(regexp_replace(coalesce(p_business_registration_number,''),'\D','','g'),'');
begin
  if (v_number is not null and length(v_number)<>10)
    or nullif(btrim(p_store_name),'') is null or length(p_store_name)>100
    or nullif(btrim(p_representative_name),'') is null or length(p_representative_name)>50
    or nullif(btrim(p_address),'') is null or length(p_address)>401
    or nullif(btrim(p_base_address),'') is null or length(p_base_address)>300
    or nullif(btrim(p_address_detail),'') is null or length(p_address_detail)>100
    or btrim(p_address)<>btrim(p_base_address)||' '||btrim(p_address_detail)
    or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{9,11}$'
    then raise exception 'public_store_profile_required'; end if;
  select * into v_request from public.store_owner_activation_requests where invite_token_hash=p_invite_token_hash
    and public_idempotency_key is not null and consumed_at is null and cancelled_at is null for update;
  if not found or v_request.expires_at<=clock_timestamp() then raise exception 'store_owner_activation_not_available'; end if;
  if v_number is not null and (exists(select 1 from public.normalized_customers where company_id=v_request.company_id
      and regexp_replace(coalesce(business_registration_number,''),'\D','','g')=v_number)
    or exists(select 1 from public.store_accounts where company_id=v_request.company_id and business_registration_number=v_number))
    then raise exception 'public_store_business_number_exists'; end if;
  if v_request.store_name is not null and row(v_request.store_name,v_request.representative_name,v_request.address,
      v_request.delivery_base_address,v_request.delivery_address_detail,v_request.phone,v_request.business_registration_number)
    is distinct from row(btrim(p_store_name),btrim(p_representative_name),btrim(p_address),btrim(p_base_address),
      btrim(p_address_detail),regexp_replace(p_phone,'\D','','g'),v_number)
    then raise exception 'public_store_retry_mismatch'; end if;
  update public.store_owner_activation_requests set store_name=btrim(p_store_name),representative_name=btrim(p_representative_name),
    address=btrim(p_address),delivery_base_address=btrim(p_base_address),delivery_address_detail=btrim(p_address_detail),
    phone=regexp_replace(p_phone,'\D','','g'),business_registration_number=v_number
    where id=v_request.id returning * into v_request;
  return jsonb_build_object('companyId',v_request.company_id,'storeAccountId',v_request.store_account_id);
end $$;

revoke all on function public.complete_public_store_owner_profile_v2(text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_public_store_owner_profile_v2(text,text,text,text,text,text,text,text) to service_role;

create or replace function public.copy_public_owner_delivery_address_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.customer_id is not null and old.customer_id is null and new.delivery_base_address is not null then
    if exists(select 1 from public.normalized_customers where company_id=new.company_id and id=new.customer_id
      and (delivery_base_address is not null or delivery_address_detail is not null)
      and row(delivery_base_address,delivery_address_detail) is distinct from
        row(new.delivery_base_address,new.delivery_address_detail))
      then raise exception 'public_store_delivery_address_mismatch'; end if;
    update public.normalized_customers set delivery_base_address=new.delivery_base_address,
      delivery_address_detail=new.delivery_address_detail
      where company_id=new.company_id and id=new.customer_id
        and delivery_base_address is null and delivery_address_detail is null;
  end if;
  return new;
end $$;
drop trigger if exists copy_public_owner_delivery_address on public.store_owner_activation_requests;
create trigger copy_public_owner_delivery_address after update of customer_id on public.store_owner_activation_requests
  for each row execute function public.copy_public_owner_delivery_address_v1();

notify pgrst,'reload schema';
commit;
