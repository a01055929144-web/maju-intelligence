-- CX-83 draft only. Do not apply without the DB owner's approval.
create table if not exists public.company_lead_favorites (
  company_id uuid not null,
  lead_id uuid not null,
  starred_by_user_id uuid,
  starred_by_name text not null check (char_length(btrim(starred_by_name)) between 1 and 120),
  starred_at timestamptz not null default now(),
  primary key (company_id, lead_id),
  constraint company_lead_favorites_lead_fk
    foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete cascade
);

comment on table public.company_lead_favorites is
  '회사 구성원이 공유하는 리드 즐겨찾기. 최초 표시자와 표시 시각을 보존한다.';

alter table public.company_lead_favorites enable row level security;
revoke all on public.company_lead_favorites from public, anon, authenticated;
grant select, insert, update, delete on public.company_lead_favorites to service_role;

create or replace function public.set_company_lead_favorite_v1(
  p_company_id uuid,
  p_lead_id uuid,
  p_starred boolean,
  p_actor_user_id uuid,
  p_actor_name text
)
returns table (
  lead_id uuid,
  starred boolean,
  starred_at timestamptz,
  starred_by_name text,
  starred_by_user_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_company_id is null or p_lead_id is null then
    raise exception using errcode = '22023', message = 'company_and_lead_required';
  end if;
  if p_actor_name is null or char_length(btrim(p_actor_name)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'actor_name_required';
  end if;
  if not exists (
    select 1 from public.business_permit_leads lead
    where lead.company_id = p_company_id and lead.id = p_lead_id and lead.merged_into_lead_id is null
  ) then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  if p_starred then
    insert into public.company_lead_favorites(company_id, lead_id, starred_by_user_id, starred_by_name)
    values (p_company_id, p_lead_id, p_actor_user_id, btrim(p_actor_name))
    on conflict on constraint company_lead_favorites_pkey do nothing;
  else
    delete from public.company_lead_favorites favorite
    where favorite.company_id = p_company_id and favorite.lead_id = p_lead_id;
  end if;

  return query
  select p_lead_id, p_starred, favorite.starred_at, favorite.starred_by_name, favorite.starred_by_user_id
  from (values (1)) sentinel(value)
  left join public.company_lead_favorites favorite
    on favorite.company_id = p_company_id and favorite.lead_id = p_lead_id;
end;
$$;

revoke all on function public.set_company_lead_favorite_v1(uuid, uuid, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_company_lead_favorite_v1(uuid, uuid, boolean, uuid, text)
  to service_role;
