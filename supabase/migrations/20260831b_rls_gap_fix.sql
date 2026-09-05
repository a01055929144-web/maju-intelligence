-- 2026-08-31 보안 감사 대응: 다른 모든 테넌트 테이블은 supabase/schema.sql 또는 각자의
-- 마이그레이션에서 이미 `enable row level security`가 걸려 있는데, 아래 4개 테이블만
-- 빠져 있었습니다(business_permit_leads/lead_actions는 20260818, customer_contacts는
-- 20260818b, company_lead_search_regions는 20260831 도입 당시 누락).
--
-- 이 앱은 클라이언트에서 Supabase에 직접 접속하지 않고(anon key 미사용, @supabase/supabase-js도
-- 미사용), 모든 DB 접근이 서버 라우트에서 서비스 롤 키로만 이뤄집니다. 서비스 롤은 RLS를
-- 우회하므로 이 마이그레이션은 지금 동작을 전혀 바꾸지 않습니다 — 다만 정책(CREATE POLICY)
-- 없이 RLS만 켜두면 "서비스 롤이 아닌 접근은 기본적으로 전부 거부"되는 안전망이 생겨,
-- 앞으로 실수로 anon key가 노출되거나 클라이언트에서 직접 접속하는 코드가 추가되더라도
-- 이 테이블들의 데이터가 곧바로 새어나가지 않습니다.
alter table public.business_permit_leads enable row level security;
alter table public.lead_actions enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.company_lead_search_regions enable row level security;
