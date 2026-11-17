-- CX-37 draft only. Do not apply without the matching approval record.
-- A user-confirmed receipt unit may fill an empty catalog unit only for 1:1
-- products. Pack conversions stay untouched and require explicit confirmation.

begin;

create or replace function public.cx37_fill_blank_catalog_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(new.unit), '') is null then
    return new;
  end if;

  update public.product_catalog
     set sales_unit = btrim(new.unit),
         updated_at = now()
   where company_id = new.company_id
     and id = new.product_catalog_id
     and nullif(btrim(sales_unit), '') is null
     and coalesce(purchase_to_sales_ratio, 1) = 1;

  return new;
end;
$$;

drop trigger if exists cx37_fill_blank_catalog_unit
  on public.purchase_receipt_lines;
create trigger cx37_fill_blank_catalog_unit
after insert or update of unit, product_catalog_id
on public.purchase_receipt_lines
for each row
execute function public.cx37_fill_blank_catalog_unit();

revoke all on function public.cx37_fill_blank_catalog_unit()
  from public, anon, authenticated;
grant execute on function public.cx37_fill_blank_catalog_unit()
  to service_role;

commit;

-- Down
-- begin;
-- drop trigger if exists cx37_fill_blank_catalog_unit on public.purchase_receipt_lines;
-- drop function if exists public.cx37_fill_blank_catalog_unit();
-- commit;
