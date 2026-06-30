# MAJU Intelligence v1 Roadmap

MAJU is not just a CRM. CRM is one feature inside a larger AI Sales Intelligence and sales data platform.

The first goal is not perfect AI. The first goal is a report experience that makes a company owner immediately understand the state of their sales data.

## Product Direction

Current positioning:

- Map CRM

Target positioning:

- AI Sales Intelligence Platform
- AI Company Diagnosis
- AI Lead Recommendation
- AI Route Optimization
- AI Sales Assistant
- Sales Data Company

## Phase 0 - MVP Foundation

Goal: prove the first experience with sample data and Excel upload.

Scope:

- Next.js web app
- Today's AI briefing
- Excel upload
- Required column mapping
- Customer data cleanup
- Company Health Score formula
- MAJU AI Report
- Admin console
- Mock/sample fallback data

Status:

- Implemented locally with production schema draft

Success criteria:

- A user can open the app, upload Excel or use sample data, and see a useful company diagnosis report.
- Admin can see analysis jobs, data quality, score weights, and lead queue.

## Phase 1 - Production Data Engine

Goal: make MAJU store real company data safely.

Scope:

- Supabase Postgres schema
- Company/account structure
- Admin users and customer company users
- Uploaded file records
- Column mapping records
- Raw uploaded rows
- Normalized customer rows
- Analysis jobs
- AI reports
- Health score snapshots
- Lead recommendations
- Admin audit logs

Data flow:

1. Excel file uploaded
2. Original file stored
3. Column mapping saved
4. Raw rows saved
5. Normalized rows saved
6. Duplicate detection runs
7. Health Score generated
8. AI Report generated
9. Lead recommendations generated
10. Admin log saved

Success criteria:

- Every upload is traceable.
- Reports can be regenerated when formulas change.
- Customer company data never mixes with other companies.

Current implementation:

- Supabase schema includes companies, app users, company members, uploaded files, imports, mappings, raw rows, normalized customers, reports, health score snapshots, lead recommendations, and audit logs.
- `/api/analyze` accepts normalized rows, raw rows, column mapping, actor name, and original filename.
- Local development still falls back to sample data when Supabase credentials are missing.

## Phase 2 - Accounts and Permissions

Goal: support real users and real customer companies.

Roles:

- MAJU super admin
- MAJU operator
- Customer company owner
- Customer company member

Scope:

- Admin login
- Customer login
- Company membership
- Role-based access
- Company-scoped data queries
- Kakao login preparation

Success criteria:

- Admin can view all companies.
- Customer users can only view their own company.
- All key actions are logged.

## Phase 3 - Company Diagnosis v1

Goal: make the diagnosis report valuable enough for sales demos.

Report sections:

- Company Health Score
- Sales power
- Delivery efficiency
- CRM management
- New sales potential
- Customer concentration
- Risk
- Region distribution
- Industry distribution
- White Space
- Potential revenue
- Top lead recommendations

Success criteria:

- A company owner can understand the report in under 3 minutes.
- The report creates a clear next action: where to sell this week.

## Phase 4 - Lead Intelligence

Goal: recommend who to sell to next.

Scope:

- Lead source ingestion
- Lead scoring
- Region-based recommendations
- Industry fit
- Delivery radius fit
- Expected revenue assumptions
- TOP50 lead queue
- Lead status management

Success criteria:

- MAJU recommends leads with clear reasons.
- Sales teams can act on recommended leads immediately.

## Phase 5 - Route Intelligence

Goal: connect recommended leads with field sales and delivery routes.

Scope:

- Visit planning
- Delivery route grouping
- Region-based route suggestions
- Tmap/Kakao/Naver map integration
- Daily route plan

Success criteria:

- A user can generate today's visit route from recommended leads.

## Phase 6 - CRM Intelligence

Goal: add CRM only after intelligence is useful.

Scope:

- Customer history
- Contacts
- Tasks
- Schedules
- Sales funnel
- Visit notes
- Follow-up reminders

Success criteria:

- CRM data improves diagnosis and recommendations.

## Phase 7 - Revenue Intelligence

Goal: detect growth, decline, and churn risks.

Scope:

- Revenue snapshots
- Decreasing revenue alerts
- Churn risk customers
- Growth potential customers
- Cross-sell recommendations
- Monthly executive report

Success criteria:

- MAJU can tell the owner where revenue is leaking.

## Phase 8 - AI Sales Assistant

Goal: help salespeople act faster.

Scope:

- Quote draft generation
- Sales scripts
- Visit summaries
- Follow-up message drafts
- Task creation
- Owner briefing

Success criteria:

- Salespeople save time after each visit and follow-up.

## Phase 9 - Network Intelligence

Goal: become a sales data company.

Scope:

- Anonymized market data
- Regional market trends
- Industry-level success patterns
- Benchmarking reports
- Market white-space intelligence

Success criteria:

- MAJU produces insights that no single customer company can produce alone.

## Immediate Build Order

The next implementation order should be:

1. Expand Supabase schema for production-grade data loading.
2. Add admin/customer account model.
3. Add upload records, raw rows, normalized rows, mappings, and audit logs.
4. Update `/api/analyze` to save the full data pipeline.
5. Update `/admin` to show real pipeline status.
6. Add basic admin login screen.
7. Add customer company dashboard.
8. Deploy to Vercel with Supabase.

## Current Technical Stack

- Frontend/App: Next.js
- UI: Tailwind CSS and shadcn-style components
- Excel parsing: SheetJS
- Backend: Next.js API Routes
- Initial production DB: Supabase Postgres
- Initial deploy: Vercel
- v1 location analysis: address and region text
- v2 location analysis: geocoding, map, heatmap, route optimization
