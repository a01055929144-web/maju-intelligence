-- 운영 자동 실행 금지. 2026-10-23 업종 재분류를 되돌릴 때만 검토 후 실행합니다.
update public.business_permit_leads l
set industry_primary = b.industry_primary,
    industry_tags = b.industry_tags,
    is_target_industry = b.is_target_industry,
    updated_at = now()
from public.lead_industry_reclassification_backup_20261023 b
where b.company_id = l.company_id
  and b.lead_id = l.id;

