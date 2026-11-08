-- DRAFT / UNAPPROVED: one-off transaction body, not a migration or permanent function.
-- Caller must BEGIN, create pg_temp.oneoff_readonly_link_input ON COMMIT DROP,
-- insert one parameterized row, execute this entire body, verify, then COMMIT.
-- Required input columns: company_id uuid, document_version_id uuid, links jsonb,
-- expires_at timestamptz, actor_user_id uuid, actor_key text.
-- Do not include any bearer token or signing secret in SQL or output.

do $$
declare i record; requested_id uuid; requested_customer uuid;
begin
  if to_regclass('pg_temp.oneoff_readonly_link_input') is null then
    raise exception 'explicit_transaction_input_required';
  end if;
  if (select count(*) from pg_temp.oneoff_readonly_link_input) <> 1 then
    raise exception 'oneoff_single_input_required';
  end if;
  select * into strict i from pg_temp.oneoff_readonly_link_input;
  if jsonb_typeof(i.links) is distinct from 'array' or jsonb_array_length(i.links) <> 1 then
    raise exception 'oneoff_single_link_required';
  end if;
  if i.links->0->'canOrder' is distinct from 'false'::jsonb then
    raise exception 'oneoff_readonly_intent_required';
  end if;
  requested_id := (i.links->0->>'id')::uuid;
  requested_customer := (i.links->0->>'customerId')::uuid;
  -- Same lock as the existing issuer: protect the preflight and issuance together.
  perform 1 from public.companies where id=i.company_id for update;
  if not found then raise exception 'oneoff_company_missing'; end if;
  if exists(select from public.storefront_links l where l.company_id=i.company_id
    and l.customer_id=requested_customer and l.document_version_id=i.document_version_id
    and l.revoked_at is null and l.expires_at>now()
    and (l.id is distinct from requested_id or l.can_order
      or l.token_nonce is distinct from i.links->0->>'nonce'
      or l.token_hash is distinct from i.links->0->>'hash')) then
    raise exception 'oneoff_existing_link_conflict';
  end if;
end $$;

create temporary table oneoff_readonly_link_result on commit drop as
select r.* from pg_temp.oneoff_readonly_link_input i
cross join lateral public.issue_storefront_links(i.company_id,i.document_version_id,
  i.links,i.expires_at,i.actor_user_id,i.actor_key) r;

-- TEST_BOUNDARY_AFTER_ISSUE: another connection must see no newly inserted link.
update public.storefront_links l set can_order=false
from pg_temp.oneoff_readonly_link_input i,pg_temp.oneoff_readonly_link_result r
where l.company_id=i.company_id and l.id=r.issued_link_id
  and l.customer_id=r.issued_customer_id and l.document_version_id=i.document_version_id
  and l.revoked_at is null;

do $$
declare i record; r record;
begin
  select * into strict i from pg_temp.oneoff_readonly_link_input;
  select * into strict r from pg_temp.oneoff_readonly_link_result;
  if r.issued_link_id is distinct from (i.links->0->>'id')::uuid
    or r.issued_customer_id is distinct from (i.links->0->>'customerId')::uuid
    or r.issued_token_nonce is distinct from i.links->0->>'nonce'
    or r.issued_token_hash is distinct from i.links->0->>'hash'
    or not exists(select from public.storefront_links l where l.id=r.issued_link_id
      and l.company_id=i.company_id and l.customer_id=r.issued_customer_id
      and l.document_version_id=i.document_version_id and l.can_order=false
      and l.revoked_at is null and l.expires_at=i.expires_at) then
    raise exception 'oneoff_readonly_postcondition_failed';
  end if;
end $$;
-- Caller reads only issued_link_id/was_created into memory, COMMITs, then reports success.
-- After COMMIT, authorized GET /api/pricing-store-links reconstructs the bearer URL.
