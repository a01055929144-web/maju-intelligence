-- Include in the CX-66 down transaction with removal of the dispatch transition.
drop trigger order_sale_document_requires_dispatch on public.business_documents;
drop function public.block_order_sale_document_early_confirmation();
