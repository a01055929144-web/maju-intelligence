-- 회사 공통 배송 템플릿을 운영 확정 7종으로 전면 교체합니다.
-- 사용자가 직접 추가한 custom_* 템플릿과 기사 개인 템플릿은 보존합니다.

begin;

-- 폐기된 예전 기본 템플릿만 제거합니다. 개인 템플릿은 FK가 ON DELETE SET NULL이므로 유지됩니다.
delete from public.company_message_templates
where template_key in (
  'delivery_partial',
  'delivery_issue',
  'left_at_door',
  'left_at_loading_area',
  'contact_request'
);

insert into public.company_message_templates (
  company_id,
  template_key,
  label,
  body,
  sort_order,
  is_active,
  updated_at
)
select
  company.id,
  template.template_key,
  template.label,
  template.body,
  template.sort_order,
  true,
  now()
from public.companies company
cross join (
  values
    ('delivery_complete', '완료 안내', E'✅ {매장명}\n배송을 마쳤습니다. 사진을 확인해 주세요.', 10),
    ('recipient_absent', '부재중 안내', E'📍 {매장명}\n담당자 부재로 배송품을 지정 장소에 두었습니다. 사진을 확인해 주세요.', 20),
    ('quantity_check', '수량 확인', E'🔢 {매장명}\n배송 수량을 확인해 주세요. 이상이 있으면 연락 부탁드립니다.', 30),
    ('returnable_collection', '회수 안내', E'♻️ {매장명}\n빈 파레트·용기를 회수했습니다. 수량을 확인해 주세요.', 40),
    ('product_return', '반품 안내', E'↩️ {매장명}\n반품 상품을 수거했습니다. 사유와 수량은 사진을 확인해 주세요.', 50),
    ('replenishment', '보충 안내', E'➕ {매장명}\n추가 보충 배송을 마쳤습니다. 사진을 확인해 주세요.', 60),
    ('delivery_note', '특이사항', E'⚠️ {매장명}\n배송 중 특이사항이 있습니다. [내용을 입력해 주세요]', 70)
) as template(template_key, label, body, sort_order)
on conflict (company_id, template_key) do update
set
  label = excluded.label,
  body = excluded.body,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

commit;
