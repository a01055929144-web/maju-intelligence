# MAJU Intelligence v1 Production Setup

This app is ready for a real server with:

- Next.js app and API routes
- Supabase Postgres database
- Vercel deployment
- GitHub Actions build check

## 1. Create Supabase Project

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Optional: run `supabase/seed.sql` to create the demo company, report, leads, and visit history.
5. Copy these values:
   - Project URL
   - Service role key

## 2. Configure Environment Variables

Set these in Vercel Project Settings.

```bash
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=strong-production-password
ADMIN_SESSION_SECRET=random-long-secret
CUSTOMER_EMAIL=owner@your-domain.com
CUSTOMER_PASSWORD=strong-production-password
CUSTOMER_COMPANY_ID=00000000-0000-4000-8000-000000000001
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only.

## 3. Deploy

Recommended flow:

1. Push this folder to GitHub as `maju-intelligence`.
2. Import the GitHub repo into Vercel.
3. Set the environment variables above.
4. Deploy.

## 4. Production URLs

- User app: `/`
- Customer login: `/dashboard/login`
- Customer dashboard: `/dashboard`
- Admin console: `/admin`
- Backend:
  - `GET /api/briefing`
  - `GET /api/report`
  - `GET /api/leads`
  - `GET /api/admin`
  - `POST /api/analyze`
  - `GET /api/customer/dashboard`
  - `GET /api/customer/me`
  - `POST /api/customer/login`
  - `POST /api/customer/logout`

Customer APIs use the logged-in customer session `companyId` to scope report and lead data.

## 5. Data Flow

Excel upload in the browser maps required columns, then posts normalized rows to `POST /api/analyze`.

If Supabase variables are configured, the API stores:

- company
- app user and company membership model
- uploaded file metadata
- column mappings
- import job
- raw uploaded rows
- normalized customer rows
- AI report JSON
- health score snapshot
- lead recommendations
- admin audit logs

The demo seed uses `CUSTOMER_COMPANY_ID=00000000-0000-4000-8000-000000000001`.

If Supabase variables are missing, the app falls back to sample data for local development.

## 6. Korean Runbook

For the Korean step-by-step production checklist, see `DEPLOYMENT.ko.md`.
