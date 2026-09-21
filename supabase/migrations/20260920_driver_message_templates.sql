-- 모바일 배송 메시지 템플릿
-- 1) 관리자가 관리하는 회사 기본값
-- 2) 기사 계정에 복사되어 기기와 무관하게 유지되는 개인값

create table if not exists public.company_message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_key text not null,
  label text not null,
  body text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_message_templates_key_not_blank check (length(btrim(template_key)) > 0),
  constraint company_message_templates_label_not_blank check (length(btrim(label)) > 0),
  constraint company_message_templates_body_not_blank check (length(btrim(body)) > 0),
  unique (company_id, template_key)
);

create index if not exists idx_company_message_templates_company_order
  on public.company_message_templates(company_id, sort_order, created_at);

create table if not exists public.driver_message_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid not null references public.app_users(id) on delete cascade,
  source_template_id uuid references public.company_message_templates(id) on delete set null,
  template_key text not null,
  label text not null,
  body text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_message_templates_key_not_blank check (length(btrim(template_key)) > 0),
  constraint driver_message_templates_label_not_blank check (length(btrim(label)) > 0),
  constraint driver_message_templates_body_not_blank check (length(btrim(body)) > 0),
  unique (company_id, driver_id, template_key)
);

create index if not exists idx_driver_message_templates_driver_order
  on public.driver_message_templates(company_id, driver_id, sort_order, created_at);

alter table public.company_message_templates enable row level security;
alter table public.driver_message_templates enable row level security;

-- 기존 회사 설정을 포함한 기본 7종을 생성합니다. template_key는 이후 "새 기본값 가져오기" 병합 키입니다.
insert into public.company_message_templates (company_id, template_key, label, body, sort_order)
select
  c.id,
  seed.template_key,
  seed.label,
  case seed.template_key
    when 'delivery_complete' then coalesce(nullif(btrim(c.delivery_complete_message), ''), seed.body)
    when 'delivery_partial' then coalesce(nullif(btrim(c.delivery_partial_message), ''), seed.body)
    when 'delivery_issue' then coalesce(nullif(btrim(c.delivery_issue_message), ''), seed.body)
    else seed.body
  end,
  seed.sort_order
from public.companies c
cross join (
  values
    ('delivery_complete', '완료 안내', E'✅ {매장명}\n배송을 마쳤습니다. 사진을 확인해 주세요.', 10),
    ('recipient_absent', '부재중 안내', E'📍 {매장명}\n담당자 부재로 배송품을 지정 장소에 두었습니다. 사진을 확인해 주세요.', 20),
    ('quantity_check', '수량 확인', E'🔢 {매장명}\n배송 수량을 확인해 주세요. 이상이 있으면 연락 부탁드립니다.', 30),
    ('returnable_collection', '회수 안내', E'♻️ {매장명}\n빈 파레트·용기를 회수했습니다. 수량을 확인해 주세요.', 40),
    ('product_return', '반품 안내', E'↩️ {매장명}\n반품 상품을 수거했습니다. 사유와 수량은 사진을 확인해 주세요.', 50),
    ('replenishment', '보충 안내', E'➕ {매장명}\n추가 보충 배송을 마쳤습니다. 사진을 확인해 주세요.', 60),
    ('delivery_note', '특이사항', E'⚠️ {매장명}\n배송 중 특이사항이 있습니다. [내용을 입력해 주세요]', 70)
) as seed(template_key, label, body, sort_order)
on conflict (company_id, template_key) do nothing;

-- 현재 활성 회사 구성원에게 회사 기본값을 개인 복사본으로 최초 1회 시드합니다.
insert into public.driver_message_templates (
  company_id,
  driver_id,
  source_template_id,
  template_key,
  label,
  body,
  sort_order
)
select
  member.company_id,
  member.user_id,
  template.id,
  template.template_key,
  template.label,
  template.body,
  template.sort_order
from public.company_members member
join public.company_message_templates template
  on template.company_id = member.company_id
 and template.is_active = true
where member.user_id is not null
  and member.status = 'active'
  and member.role in ('driver', 'member')
on conflict (company_id, driver_id, template_key) do nothing;

comment on table public.company_message_templates is '회사가 관리하는 배송 메시지 기본 템플릿';
comment on table public.driver_message_templates is '기사 계정별 배송 메시지 개인 복사본';
comment on column public.driver_message_templates.template_key is '회사 기본값 신규 병합 시 사용하는 안정 키';
