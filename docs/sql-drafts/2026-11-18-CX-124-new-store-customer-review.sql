-- CX-124 새 매장 매출처 확인 목록. REVIEW ONLY. DO NOT EXECUTE.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function public.list_pending_store_customer_reviews_v1(p_company uuid)
returns table(store_account_id uuid, customer_id uuid, name text, address text, business_number text, created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp
as $$
  select a.id,a.customer_id,c.customer_name,c.address,nullif(a.business_registration_number,''),a.created_at
  from public.store_accounts a
  join public.normalized_customers c on c.company_id=a.company_id and c.id=a.customer_id
  where a.company_id=p_company and a.status='active' and a.customer_review_status='needs_review'
  order by a.created_at asc,a.id asc
$$;
revoke all on function public.list_pending_store_customer_reviews_v1(uuid) from public,anon,authenticated;
grant execute on function public.list_pending_store_customer_reviews_v1(uuid) to service_role;
comment on function public.list_pending_store_customer_reviews_v1(uuid) is 'CX-124 distributor-side pending store review list; writes remain in CX-13 review RPCs.';
commit;
