-- CX-66 integration fragment. Include in the same transaction as the approved
-- dispatch RPC. That RPC must set the transaction-local marker to this order's
-- UUID immediately before confirmation, then clear it.
create function public.block_order_sale_document_early_confirmation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if nullif(current_setting('maju.dispatch_confirm_order', true), '') is distinct from old.source_id::text then
    raise exception 'order_sale_document_requires_dispatch';
  end if;
  return new;
end $$;
revoke all on function public.block_order_sale_document_early_confirmation() from public, anon, authenticated;
create trigger order_sale_document_requires_dispatch
  before update of status on public.business_documents for each row
  when (old.source_type = 'order' and old.document_type = 'sale'
    and old.status = 'draft' and new.status = 'confirmed')
  execute function public.block_order_sale_document_early_confirmation();
