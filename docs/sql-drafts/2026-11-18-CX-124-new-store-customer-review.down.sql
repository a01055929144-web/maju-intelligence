-- CX-124 review-only rollback. Refuses while pending review evidence exists.
begin;
do $$ begin
  if exists(select 1 from public.store_accounts where customer_review_status='needs_review') then
    raise exception 'cx124_down_refused_pending_store_reviews';
  end if;
end $$;
drop function public.list_pending_store_customer_reviews_v1(uuid);
commit;
