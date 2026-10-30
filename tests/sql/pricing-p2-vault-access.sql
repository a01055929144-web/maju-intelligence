-- Local-only authorization/audit regression, rolled back in full.
begin;
do $$
declare c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); cust uuid:=gen_random_uuid(); othercust uuid:=gen_random_uuid();
 member uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); owner_actor uuid:=gen_random_uuid(); photo uuid:=gen_random_uuid(); reg uuid:=gen_random_uuid();
 d date:=(clock_timestamp() at time zone 'Asia/Seoul')::date; result jsonb; before_count integer;
begin
 insert into companies(id) values(c),(c2);
 insert into normalized_customers(id,company_id,customer_name) values(cust,c,'synthetic vault'),(othercust,c,'other synthetic');
 insert into company_members(id,company_id,user_id,role,permission_role,duties) values(member,c,actor,'custom label','staff',array['delivery']), (gen_random_uuid(),c,owner_actor,'owner','owner','{}');
 insert into store_onboarding_vault(id,company_id,customer_id,kind,state,expires_at,object_key,content_type,byte_size,sha256,scan_status,sanitized)
 values(photo,c,cust,'loading-photo','available',clock_timestamp()+interval '1 day',c::text||'/'||cust::text||'/'||photo::text,'image/png',100,repeat('a',64),'clean',true),
 (reg,c,cust,'registration','available',clock_timestamp()+interval '1 day',c::text||'/'||cust::text||'/'||reg::text,'application/pdf',100,repeat('b',64),'clean',false);
 insert into store_onboarding_delivery_grants(company_id,customer_id,staff_member_id,delivery_date,source_confirmation_id,valid_until)
 values(c,cust,member,d,gen_random_uuid(),((d+1)::timestamp at time zone 'Asia/Seoul'));
 execute 'set local role service_role';
 result:=authorize_store_onboarding_read(c,actor,photo,'delivery-location');
 if result->>'auditId' is null or result->>'actorId'<>actor::text or result->'record'->>'id'<>photo::text or
 (result->>'readUntil')::timestamptz>(result->>'authorizedAt')::timestamptz+interval '5 seconds' then raise exception 'Invalid audited payload';end if;
 if not exists(select from store_onboarding_audit where id=(result->>'auditId')::uuid and actor_id=actor and staff_member_id=member and delivery_grant_id is not null and source_confirmation_id is not null and permission_snapshot='staff') then raise exception 'Missing audit';end if;
 begin perform authorize_store_onboarding_read(c2,actor,photo,'delivery-location');raise exception 'Cross company allowed';exception when raise_exception then if sqlerrm='Cross company allowed' then raise;end if;end;
 begin perform authorize_store_onboarding_read(c,actor,reg,'verify-registration');raise exception 'Driver registration allowed';exception when raise_exception then if sqlerrm='Driver registration allowed' then raise;end if;end;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-access');raise exception 'Wrong purpose allowed';exception when raise_exception then if sqlerrm='Wrong purpose allowed' then raise;end if;end;
 update store_onboarding_delivery_grants set revoked_at=clock_timestamp() where staff_member_id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Revoked grant allowed';exception when raise_exception then if sqlerrm='Revoked grant allowed' then raise;end if;end;
 update store_onboarding_delivery_grants set revoked_at=null,customer_id=othercust where staff_member_id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Other customer allowed';exception when raise_exception then if sqlerrm='Other customer allowed' then raise;end if;end;
 update store_onboarding_delivery_grants set customer_id=cust,delivery_date=d-1,valid_until=(d::timestamp at time zone 'Asia/Seoul') where staff_member_id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Yesterday grant allowed';exception when raise_exception then if sqlerrm='Yesterday grant allowed' then raise;end if;end;
 update store_onboarding_delivery_grants set delivery_date=d,valid_until=((d+1)::timestamp at time zone 'Asia/Seoul') where staff_member_id=member;
 update company_members set status='inactive' where id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Inactive member allowed';exception when raise_exception then if sqlerrm='Inactive member allowed' then raise;end if;end;
 update company_members set status='active',permission_role='temporary',membership_expires_at=clock_timestamp()+interval '1 day' where id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Temporary member allowed';exception when raise_exception then if sqlerrm='Temporary member allowed' then raise;end if;end;
 update company_members set permission_role='staff',membership_expires_at=clock_timestamp()-interval '1 second' where id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Expired member allowed';exception when raise_exception then if sqlerrm='Expired member allowed' then raise;end if;end;
 update company_members set membership_expires_at=null,duties=array['sales'] where id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Sales member allowed';exception when raise_exception then if sqlerrm='Sales member allowed' then raise;end if;end;
 update company_members set role='owner' where id=member;
 begin perform authorize_store_onboarding_read(c,actor,photo,'delivery-location');raise exception 'Legacy owner bypassed permission downgrade';exception when raise_exception then if sqlerrm='Legacy owner bypassed permission downgrade' then raise;end if;end;
 result:=authorize_store_onboarding_read(c,owner_actor,reg,'verify-registration');
 if result->'record'->>'kind'<>'registration' then raise exception 'Owner registration unavailable';end if;
 update store_onboarding_vault set expires_at=clock_timestamp()-interval '1 second',collected_at=clock_timestamp()-interval '1 day' where id=photo;
 begin perform authorize_store_onboarding_read(c,owner_actor,photo,'delivery-location');raise exception 'Expired record allowed';exception when raise_exception then if sqlerrm='Expired record allowed' then raise;end if;end;
 if has_function_privilege('anon','authorize_store_onboarding_read(uuid,uuid,uuid,text)','execute') or has_function_privilege('authenticated','authorize_store_onboarding_read(uuid,uuid,uuid,text)','execute') then raise exception 'Public read RPC grant';end if;
 execute 'reset role';
 alter table company_members drop constraint company_members_company_id_user_id_key;
 insert into company_members(id,company_id,user_id,role,permission_role) values(gen_random_uuid(),c,owner_actor,'owner','owner');
 begin perform authorize_store_onboarding_read(c,owner_actor,reg,'verify-registration');raise exception 'Ambiguous membership allowed';exception when raise_exception then if sqlerrm='Ambiguous membership allowed' then raise;end if;end;
 delete from company_members where user_id=owner_actor and id<>(select min(id::text)::uuid from company_members where user_id=owner_actor);

end $$;
-- An audit write error must abort authorization instead of returning a payload.
create function pg_temp.fail_vault_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit unavailable';end $$;
create trigger synthetic_audit_failure before insert on store_onboarding_audit for each row execute function pg_temp.fail_vault_audit();
do $$ declare c uuid; u uuid; r uuid; n integer; begin
 select m.company_id,m.user_id,v.id into c,u,r from company_members m join store_onboarding_vault v on v.company_id=m.company_id where m.permission_role='owner' and v.kind='registration';
 select count(*) into n from store_onboarding_audit;
 begin perform authorize_store_onboarding_read(c,u,r,'verify-registration');raise exception 'Audit failure ignored';exception when raise_exception then if sqlerrm<>'synthetic audit unavailable' then raise;end if;end;
 if (select count(*) from store_onboarding_audit)<>n then raise exception 'Partial audit result';end if;
end $$;
rollback;
