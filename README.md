# MAJU Intelligence v1

AI Sales Intelligence Platform MVP.

## MVP Scope

- Excel upload with SheetJS
- Required column mapping
- Customer data cleanup and duplicate removal
- Company Health Score formula
- MAJU AI Report screen
- Today's AI briefing screen
- Admin console
- Backend API routes
- Text-based region analysis for v1

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## App Routes

- User app: `http://localhost:3000`
- Customer dashboard: `http://localhost:3000/dashboard`
- Customer login: `http://localhost:3000/dashboard/login`
- Report detail: `http://localhost:3000/reports/latest`
- Today's route plan: `http://localhost:3000/routes/today`
- CRM timeline: `http://localhost:3000/crm/timeline`
- Revenue pipeline: `http://localhost:3000/revenue/pipeline`
- AI Sales Assistant: `http://localhost:3000/assistant`
- Admin console: `http://localhost:3000/admin`
- Admin system check: `http://localhost:3000/admin/system`
- Admin login: `http://localhost:3000/admin/login`

## Backend Routes

- `GET /api/briefing`
- `GET /api/report`
- `GET /api/leads`
- `PATCH /api/leads/[id]/status`
- `GET /api/routes/today`
- `POST /api/visits`
- `GET /api/visits/timeline`
- `GET /api/revenue/pipeline`
- `GET /api/assistant/drafts`
- `GET /api/admin`
- `GET /api/admin/system`
- `POST /api/analyze`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/customer/me`
- `GET /api/customer/dashboard`
- `POST /api/customer/login`
- `POST /api/customer/logout`

## GitHub

The project includes `.github/workflows/ci.yml` for install and build checks on pull requests and pushes to `main`.

## Production

See `DEPLOYMENT.md` and `DEPLOYMENT.ko.md`. The app supports Supabase-backed production storage through these environment variables:

- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Product Flow

See `FLOW_VALIDATION.ko.md` for the v1 flow validation checklist.
