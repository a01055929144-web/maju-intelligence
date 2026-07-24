# MAJU Intelligence

MAJU Intelligence는 식자재 유통사의 거래처, 매출, 배송 동선, 영업 히스토리를 한 곳에서 관리하는 AI Sales Intelligence Platform입니다.

## 운영 범위

- 관리자 회사/고객사 계정 생성
- 고객사 로그인과 회사 설정 관리
- 고객사 직원 카카오 가입과 모바일 업무 앱 확장 준비
- 거래처 마스터 수기 등록 및 엑셀 대량 등록
- ERP별 매출 거래내역 업로드와 컬럼 매핑
- 거래처 정제, 중복 방지, 사업자번호 기반 관리
- 매출 등급, 방문 이력, 메모, 첨부자료 관리
- Company Health Score와 MAJU AI Report
- 오늘의 영업/배송 코스와 TMAP 경로 계산
- Supabase 기반 서버 저장과 관리자 운영 점검

## Run

```bash
npm install
npm run dev
```

로컬 확인은 `http://localhost:3000`에서 진행합니다.

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
- Staff mobile join: `http://localhost:3000/mobile/join?invite=YOUR_INVITE_CODE`

## Staff Mobile

고객사 직원은 카카오톡 초대 링크로 `/mobile/join?invite=...`에 접속해 가입하고, 모바일에서 오늘 코스, 거래처 간략 정보, 배송 적재위치 사진/영상, 방문 메모를 처리합니다. 설계 기준은 `STAFF_MOBILE_AUTH.ko.md`에서 관리합니다.

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

운영 배포 절차는 `DEPLOYMENT.ko.md`를 기준으로 진행합니다. 서버 저장은 Supabase 환경변수를 통해 활성화됩니다.

- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Product Flow

제품 운영 흐름과 검증 기준은 `FLOW_VALIDATION.ko.md`에서 관리합니다.
