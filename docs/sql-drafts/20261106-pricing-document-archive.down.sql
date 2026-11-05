-- REVIEW ONLY. Turn PRICING_DOCUMENT_ARCHIVE_ENABLED OFF first. Separate approval required.
begin;
set local lock_timeout = '5s';
drop trigger guard_archived_document_edit on public.pricing_documents;
drop trigger guard_archived_document_publish on public.pricing_document_versions;
drop function public.guard_archived_pricing_document();
drop function public.set_pricing_document_archived(uuid,text,boolean,uuid,integer,boolean);
alter table public.pricing_documents drop column archived_at;
-- Documents reappear in active lists; published content, links and orders are untouched.
commit;
