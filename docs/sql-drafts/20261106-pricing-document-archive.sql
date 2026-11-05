-- REVIEW ONLY. Operating fcmdvveqmcgtioelzqun approval required. Feature OFF until applied.
-- Preserve published versions, links, orders and content. No physical deletion.
begin;
set local lock_timeout = '5s';
alter table public.pricing_documents add column archived_at timestamptz;

create function public.set_pricing_document_archived(
  p_company uuid, p_actor text, p_manager boolean, p_document uuid, p_expected integer, p_archived boolean
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare d public.pricing_documents%rowtype;
begin
  if p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_expected is null or p_expected < 1 or p_archived is null or p_manager is null then raise exception 'Invalid archive scope'; end if;
  -- Match pricing_p1 mutation lock order, including concurrent save/publish.
  perform 1 from public.companies where id=p_company for update;
  select * into d from public.pricing_documents where company_id=p_company and id=p_document for update;
  if not found or (d.kind='quote' and d.owner_key<>p_actor) or (d.kind='sheet' and not p_manager) then raise exception 'Document not found'; end if;
  if d.revision<>p_expected then raise exception 'Stale document'; end if;
  if (d.archived_at is not null)=p_archived then return jsonb_build_object('id',d.id,'revision',d.revision,'archivedAt',d.archived_at); end if;
  update public.pricing_documents set archived_at=case when p_archived then clock_timestamp() else null end,
    revision=revision+1, updated_at=clock_timestamp() where company_id=p_company and id=p_document returning * into d;
  return jsonb_build_object('id',d.id,'revision',d.revision,'archivedAt',d.archived_at);
end $$;
revoke all on function public.set_pricing_document_archived(uuid,text,boolean,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.set_pricing_document_archived(uuid,text,boolean,uuid,integer,boolean) to service_role;

-- Old clients cannot edit or publish archived documents. Restore before editing.
create function public.guard_archived_pricing_document() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_table_name='pricing_documents' then
    if old.archived_at is not null then raise exception 'Archived document'; end if;
  else
    perform 1 from public.pricing_documents where company_id=new.company_id and id=new.document_id and archived_at is not null;
    if found then raise exception 'Archived document'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_archived_pricing_document() from public,anon,authenticated;
grant execute on function public.guard_archived_pricing_document() to service_role;
create trigger guard_archived_document_edit before update of content on public.pricing_documents
  for each row execute function public.guard_archived_pricing_document();
create trigger guard_archived_document_publish before insert on public.pricing_document_versions
  for each row execute function public.guard_archived_pricing_document();
commit;
