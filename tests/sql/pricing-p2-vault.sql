-- Synthetic local-only protection schema regressions. No retained records.
begin;
do $$
declare c uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
begin
 insert into companies(id) values(c),(other);
 insert into normalized_customers(id,company_id,customer_name) values(customer,c,'vault synthetic');
 begin
  insert into store_onboarding_vault(id,company_id,customer_id,kind,expires_at,object_key,content_type,byte_size,sha256)
  values(r,other,customer,'registration',clock_timestamp()+interval '1 day',other::text||'/'||customer::text||'/'||r::text,'application/pdf',100,repeat('a',64));
  raise exception 'Cross-company vault accepted';
 exception when foreign_key_violation then null; end;
 begin insert into store_onboarding_vault(id,company_id,customer_id,kind,expires_at) values(gen_random_uuid(),c,customer,'entrance',clock_timestamp()+interval '1 day'); raise exception 'Null envelope accepted'; exception when check_violation then null; end;
 insert into store_onboarding_vault(id,company_id,customer_id,kind,expires_at,object_key,content_type,byte_size,sha256)
 values(r,c,customer,'loading-photo',clock_timestamp()+interval '1 day',c::text||'/'||customer::text||'/'||r::text,'image/png',100,repeat('a',64));
 begin update store_onboarding_vault set state='available' where id=r; raise exception 'Unscanned file readable'; exception when check_violation then null; end;
 update store_onboarding_vault set scan_status='clean' where id=r;
 begin update store_onboarding_vault set state='available' where id=r; raise exception 'Unsanitized image readable'; exception when check_violation then null; end;
 update store_onboarding_vault set sanitized=true,state='available' where id=r;
 begin update store_onboarding_vault set expires_at=collected_at+interval '31 days' where id=r; raise exception 'Retention extended'; exception when check_violation then null; end;
 begin delete from store_onboarding_vault where id=r; raise exception 'Unpurged file deleted'; exception when raise_exception then if sqlerrm='Unpurged file deleted' then raise;end if;end;
 begin delete from companies where id=c; raise exception 'Company orphaned private objects'; exception when foreign_key_violation then null; end;
 insert into store_onboarding_audit(company_id,customer_id,record_id,actor_id,purpose) values(c,customer,r,gen_random_uuid(),'delivery-location');
 begin update store_onboarding_audit set purpose='delivery-access' where record_id=r; raise exception 'Audit changed'; exception when raise_exception then if sqlerrm='Audit changed' then raise;end if;end;
 update store_onboarding_vault set state='deleting' where id=r;
 update store_onboarding_vault set state='deleted',object_key=null,sha256=null,content_type=null,byte_size=null where id=r;
 delete from store_onboarding_vault where id=r;
 if has_table_privilege('anon','store_onboarding_vault','select') or has_table_privilege('authenticated','store_onboarding_vault','insert') or has_table_privilege('service_role','store_onboarding_audit','delete') then raise exception 'Vault ACL';end if;
end $$;
rollback;
