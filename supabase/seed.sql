-- MAJU Intelligence v1 demo seed
-- Run after supabase/schema.sql when you want a production-like demo company.

insert into public.companies (id, name, business_type, owner_name, status)
values
  ('00000000-0000-4000-8000-000000000001', '마주식자재', '식자재 유통', '정두영', 'active')
on conflict (id) do update set
  name = excluded.name,
  business_type = excluded.business_type,
  owner_name = excluded.owner_name,
  status = excluded.status,
  updated_at = now();

insert into public.app_users (id, email, name, role, status)
values
  ('00000000-0000-4000-8000-000000000101', 'owner@maju.local', '정두영', 'customer_owner', 'active'),
  ('00000000-0000-4000-8000-000000000102', 'admin@maju.local', 'MAJU 관리자', 'super_admin', 'active')
on conflict (id) do update set
  email = excluded.email,
  name = excluded.name,
  role = excluded.role,
  status = excluded.status;

insert into public.company_members (id, company_id, user_id, role)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'owner'
)
on conflict (id) do update set
  company_id = excluded.company_id,
  user_id = excluded.user_id,
  role = excluded.role;

insert into public.uploaded_files (id, company_id, uploaded_by, original_filename, status)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  '거래처_현황_2026_06.xlsx',
  'processed'
)
on conflict (id) do update set
  original_filename = excluded.original_filename,
  status = excluded.status;

insert into public.customer_imports (
  id,
  company_id,
  uploaded_file_id,
  source,
  row_count,
  status,
  quality_score,
  duplicate_count,
  completed_at
)
values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301',
  'excel',
  483,
  'completed',
  92,
  7,
  now()
)
on conflict (id) do update set
  row_count = excluded.row_count,
  status = excluded.status,
  quality_score = excluded.quality_score,
  duplicate_count = excluded.duplicate_count,
  completed_at = excluded.completed_at;

insert into public.ai_reports (id, company_id, import_id, health_score, report)
values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000401',
  82,
  '{
    "companyName": "마주식자재",
    "customers": 483,
    "regions": 17,
    "totalRevenue": 84200,
    "avgDeliveryKm": 18.7,
    "highProbabilityCount": 4,
    "newOpportunities": 147,
    "routeLeads": 18,
    "missingRegions": ["성수동", "망원동", "위례"],
    "regionDistribution": [
      { "region": "성동구", "count": 83, "potential": 214, "whitespace": 131 },
      { "region": "강남구", "count": 61, "potential": 342, "whitespace": 281 },
      { "region": "송파구", "count": 58, "potential": 581, "whitespace": 523 },
      { "region": "하남", "count": 31, "potential": 188, "whitespace": 157 }
    ],
    "industryDistribution": [
      { "industry": "한식", "count": 295, "share": 61 },
      { "industry": "분식", "count": 62, "share": 13 },
      { "industry": "카페", "count": 19, "share": 4 },
      { "industry": "베이커리", "count": 5, "share": 1 }
    ],
    "health": {
      "total": 82,
      "salesPower": 92,
      "deliveryEfficiency": 78,
      "crmManagement": 65,
      "newSales": 54,
      "concentration": 81,
      "risk": 69
    },
    "leadRecommendations": [
      { "name": "성수 한식 A", "region": "성수동", "score": 92, "reasons": ["신규오픈", "배송반경", "예상매출", "경쟁사 미확인"] },
      { "name": "송파 신규오픈 B", "region": "송파구", "score": 89, "reasons": ["White Space", "예상매출", "시장규모"] },
      { "name": "망원 한식 C", "region": "망원동", "score": 87, "reasons": ["업종 적합", "배송반경", "재방문 가능"] }
    ],
    "aiInsights": [
      "성동구 비중이 높습니다. 기존 강점을 유지하되 성수동 신규 리드를 우선 확인하세요.",
      "평균 배송거리는 18.7km입니다. 반경 기준으로 묶으면 하루 약 52km 절감 여지가 있습니다.",
      "송파구는 거래처 2곳 대비 음식점 수가 많아 White Space가 큽니다.",
      "한식 업종 전문성이 확인됩니다. v1에서는 한식 확장에 집중하고 카페, 베이커리는 검증 리드로 분리하세요."
    ],
    "potentialRevenue": 2300
  }'::jsonb
)
on conflict (id) do update set
  health_score = excluded.health_score,
  report = excluded.report;

insert into public.health_score_snapshots (
  id,
  company_id,
  report_id,
  total,
  sales_power,
  delivery_efficiency,
  crm_management,
  new_sales,
  concentration,
  risk,
  formula_version
)
values (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000501',
  82,
  92,
  78,
  65,
  54,
  81,
  69,
  'v1'
)
on conflict (id) do update set
  total = excluded.total,
  sales_power = excluded.sales_power,
  delivery_efficiency = excluded.delivery_efficiency,
  crm_management = excluded.crm_management,
  new_sales = excluded.new_sales,
  concentration = excluded.concentration,
  risk = excluded.risk,
  formula_version = excluded.formula_version;

insert into public.lead_recommendations (id, company_id, report_id, name, region, score, reasons, status)
values
  (
    '00000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000501',
    '성수 한식 A',
    '성수동',
    92,
    '["신규오픈", "배송반경", "예상매출", "경쟁사 미확인"]'::jsonb,
    'today'
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000501',
    '송파 신규오픈 B',
    '송파구',
    89,
    '["White Space", "예상매출", "시장규모"]'::jsonb,
    'visit-planned'
  ),
  (
    '00000000-0000-4000-8000-000000000703',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000501',
    '망원 한식 C',
    '망원동',
    87,
    '["업종 적합", "배송반경", "재방문 가능"]'::jsonb,
    'this-week'
  )
on conflict (id) do update set
  name = excluded.name,
  region = excluded.region,
  score = excluded.score,
  reasons = excluded.reasons,
  status = excluded.status;

insert into public.visit_results (id, company_id, lead_id, result, memo, next_action, expected_revenue)
values
  (
    '00000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000701',
    'quote-requested',
    '대표가 단가표 요청. 다음주 월요일 견적 발송 필요.',
    '견적서 발송',
    260
  ),
  (
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000702',
    'interested',
    '샘플 납품 가능 여부 확인 요청.',
    '재방문 일정 조율',
    244
  )
on conflict (id) do update set
  result = excluded.result,
  memo = excluded.memo,
  next_action = excluded.next_action,
  expected_revenue = excluded.expected_revenue;
