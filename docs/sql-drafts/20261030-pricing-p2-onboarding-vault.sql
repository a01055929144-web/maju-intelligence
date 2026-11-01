-- REVIEW ONLY. Fresh disposable PG16 database after P2. Never applied to production.
-- No bucket, upload endpoint, SMS adapter, or runtime activation is created here.
begin;
create table public.store_onboarding_vault (
 id uuid primary key, company_id uuid not null references companies(id) on delete restrict,
 customer_id uuid not null, kind text not null check(kind in ('registration','loading-photo','entrance')),
 state text not null default 'quarantine' check(state in ('quarantine','available','deleting','deleted')),
 collected_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 object_key text, content_type text, byte_size integer, sha256 text,
 scan_status text not null default 'pending' check(scan_status in ('pending','clean','rejected')),
 sanitized boolean not null default false, envelope jsonb,
 unique(company_id,id), foreign key(company_id,customer_id) references normalized_customers(company_id,id) on delete restrict,
 check(expires_at>collected_at and expires_at<=collected_at+interval '30 days'),
 check(state='deleted' or coalesce((kind='entrance' and object_key is null and content_type is null and byte_size is null and sha256 is null
   and jsonb_typeof(envelope)='object' and envelope-array['version','keyId','iv','tag','ciphertext']='{}'::jsonb
   and envelope->'version'='1'::jsonb and envelope->>'keyId' ~ '^[a-zA-Z0-9_-]{1,64}$'
   and envelope->>'iv' ~ '^[A-Za-z0-9+/]{16}$' and envelope->>'tag' ~ '^[A-Za-z0-9+/]{22}==$'
   and length(envelope->>'ciphertext') between 4 and 2800
   and envelope->>'ciphertext' ~ '^[A-Za-z0-9+/]+={0,2}$' and length(envelope->>'ciphertext')%4=0)
   or (kind<>'entrance' and envelope is null and object_key=company_id::text||'/'||customer_id::text||'/'||id::text
    and sha256 ~ '^[0-9a-f]{64}$' and byte_size>0 and
    ((content_type in ('image/jpeg','image/png') and byte_size<=5242880) or
     (kind='registration' and content_type='application/pdf' and byte_size<=10485760))),false)),
 check(state<>'available' or kind='entrance' or (scan_status='clean' and (kind<>'loading-photo' or sanitized))),
 check(state<>'deleted' or (object_key is null and envelope is null and sha256 is null and content_type is null and byte_size is null))
);
create index store_onboarding_expiry_idx on store_onboarding_vault(expires_at) where state<>'deleted';
create table public.store_onboarding_audit (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, customer_id uuid not null,
 record_id uuid not null, actor_id uuid not null,
 purpose text not null check(purpose in ('verify-registration','delivery-access','delivery-location','purge-confirmed')),
 occurred_at timestamptz not null default clock_timestamp()
);
create index store_onboarding_audit_scope_idx on store_onboarding_audit(company_id,record_id,occurred_at);
create function public.store_onboarding_keep_audit() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Vault audit is append-only'; end $$;
create trigger store_onboarding_keep_audit before update or delete on store_onboarding_audit for each row execute function store_onboarding_keep_audit();
create function public.store_onboarding_delete_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin if old.state<>'deleted' then raise exception 'Private object purge must be confirmed first'; end if; return old; end $$;
create trigger store_onboarding_delete_guard before delete on store_onboarding_vault for each row execute function store_onboarding_delete_guard();
alter table store_onboarding_vault enable row level security;
alter table store_onboarding_audit enable row level security;
revoke all on store_onboarding_vault,store_onboarding_audit from public,anon,authenticated,service_role;
grant select,insert,update,delete on store_onboarding_vault to service_role;
grant select,insert on store_onboarding_audit to service_role;
revoke all on function store_onboarding_keep_audit(),store_onboarding_delete_guard() from public,anon,authenticated,service_role;
commit;
