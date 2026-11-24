-- CX-133 draft only. Separate representative approval required before production.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
 if exists(select 1 from public.pricing_settings where rounding=50)
 or exists(select 1 from public.margin_groups where rounding=50)
 or exists(select 1 from public.margin_templates where rounding=50)
 or exists(select 1 from public.pricing_items where applied_rounding=50)
 then raise exception 'cx133_down_rounding_50_in_use'; end if;
end $$;
alter table public.pricing_settings drop constraint pricing_settings_rounding_check;
alter table public.pricing_settings add constraint pricing_settings_rounding_check check(rounding in (1,10,100));
alter table public.margin_groups drop constraint margin_groups_rounding_check;
alter table public.margin_groups add constraint margin_groups_rounding_check check(rounding in (1,10,100));
alter table public.margin_templates drop constraint margin_templates_rounding_check;
alter table public.margin_templates add constraint margin_templates_rounding_check check(rounding in (1,10,100));
create or replace function public.pricing_p0_price(cost numeric, bp integer, rounding integer, direct_price bigint default null)
returns bigint language plpgsql immutable set search_path = public,pg_temp as $$
declare result numeric;
begin
 if direct_price is not null then
   if direct_price < 0 or direct_price > 1000000000000 then raise exception 'Invalid direct price'; end if;
   return direct_price;
 end if;
 if cost is null or cost < 0 or cost > 1000000000000 or bp is null or bp < 0 or bp > 100000 or rounding is null or rounding not in (1,10,100) then raise exception 'Invalid price inputs'; end if;
 result := ceil(cost * (10000+bp) / 10000 / rounding) * rounding;
 if result > 1000000000000 then raise exception 'Price overflow'; end if;
 return result::bigint;
end $$;
commit;
