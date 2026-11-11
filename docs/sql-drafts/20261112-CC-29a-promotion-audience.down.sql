-- DOWN for CC-29a. Removes the judgment function, the targets table and the audience column.
-- Refused when any promotion already has a restricted audience or targets (that setting would be lost);
-- set those promotions back to "all stores" first.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.pricing_promotion_targets') is null then raise exception 'cc29a_not_applied'; end if;
  if exists(select 1 from public.pricing_promotions where audience <> 'all') or exists(select 1 from public.pricing_promotion_targets)
    then raise exception 'cc29a_down_refused_audience_in_use'; end if;
end $$;

drop function public.promotion_applies_to(uuid,uuid,uuid);
drop table public.pricing_promotion_targets;
alter table public.pricing_promotions drop column audience;
commit;
