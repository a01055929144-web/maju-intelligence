# MAJU Intelligence 실서비스 배포 런북

이 문서는 `maju-intelligence`를 GitHub, Vercel, Supabase에 연결해서 실제 서비스 URL로 운영하기 위한 체크리스트입니다.

## 1. 현재 준비 완료 상태

- GitHub 저장소: `https://github.com/a01055929144-web/maju-intelligence`
- Next.js 앱/웹: 준비 완료
- 백엔드 API Routes: 준비 완료
- 관리자 페이지: 준비 완료
- 관리자 로그인: 준비 완료
- 고객 대시보드 로그인: 준비 완료
- Supabase 스키마: `supabase/schema.sql`
- Supabase 초기 운영 데이터 seed: `supabase/seed.sql`
- Vercel 설정 파일: `vercel.json`
- GitHub Actions 빌드 체크: `.github/workflows/ci.yml`

## 2. Vercel 배포 순서

1. Vercel에 로그인합니다.
2. `Add New Project`를 선택합니다.
3. GitHub 저장소 `a01055929144-web/maju-intelligence`를 Import 합니다.
4. Framework Preset은 `Next.js`로 둡니다.
5. Build Command는 `npm run build`를 사용합니다.
6. Output Directory는 비워둡니다.
7. Environment Variables를 아래 값으로 입력합니다.
8. Deploy를 누릅니다.

## 3. Supabase DB 생성 순서

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor를 엽니다.
3. 이 저장소의 `supabase/schema.sql` 전체를 붙여넣고 실행합니다.
4. 초기 운영 점검용 고객사와 리포트가 필요하면 `supabase/seed.sql`도 이어서 실행합니다.
5. Project Settings > API에서 아래 값을 복사합니다.
   - Project URL
   - service_role key
6. 복사한 값을 Vercel Environment Variables에 등록합니다.

## 4. Vercel 환경변수

아래 값은 Vercel Project Settings > Environment Variables에 등록합니다.

```bash
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=replace-with-strong-password
ADMIN_SESSION_SECRET=replace-with-random-long-secret

CUSTOMER_EMAIL=owner@your-domain.com
CUSTOMER_PASSWORD=replace-with-strong-password
CUSTOMER_COMPANY_ID=00000000-0000-4000-8000-000000000001

COMPANY_ORIGIN_ADDRESS=경기도 하남시 초이로 133 1층
TMAP_API_KEY=replace-with-tmap-api-key
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=your-kakao-javascript-key

KAKAO_CLIENT_ID=your-kakao-rest-api-key
KAKAO_CLIENT_SECRET=optional-kakao-client-secret
KAKAO_REDIRECT_URI=https://your-vercel-domain.vercel.app/api/auth/kakao/callback
```

주의: `SUPABASE_SERVICE_ROLE_KEY`는 절대 브라우저나 공개 문서에 노출하면 안 됩니다.

카카오맵을 실제로 표시하려면 Kakao Developers에서 JavaScript 키를 발급하고, 앱 설정 > 플랫폼 > Web에 아래 도메인을 등록합니다.

- `https://maju-intelligence.vercel.app`
- `http://localhost:3000`

등록 후 Vercel Environment Variables에 `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`를 추가하고 재배포합니다.

## 5. 배포 후 확인 URL

배포 URL이 `https://maju-intelligence.vercel.app`이라고 가정하면 아래 순서로 확인합니다.

- `/` : 엑셀 업로드 및 AI 회사 진단 화면
- `/dashboard/login` : 고객 로그인
- `/dashboard` : 고객 대시보드
- `/admin/login` : 관리자 로그인
- `/admin` : 관리자 콘솔
- `/admin/system` : 실서버 환경변수 및 DB 연결 상태 확인
- `/routes/today` : 오늘의 영업/방문 동선
- `/crm/timeline` : 방문 결과 타임라인
- `/revenue/pipeline` : 매출 파이프라인
- `/assistant` : AI 영업 도우미 초안

## 6. 첫 운영 테스트

1. `/admin/system`에서 운영 준비 상태, Supabase 연결, Storage 상태를 확인합니다.
2. `/`에서 거래처 마스터 또는 매출 거래내역 파일로 분석을 실행합니다.
3. `/admin`에서 업로드 이력과 리드 추천 목록이 보이는지 확인합니다.
4. `/dashboard/login`에서 고객 계정으로 로그인합니다.
5. `/dashboard`에서 회사 진단 리포트가 고객 범위로 보이는지 확인합니다.
6. `/routes/today`에서 리드 상태 변경과 방문 결과 저장 흐름을 확인합니다.

## 7. 운영 전 필수 변경

- `ADMIN_PASSWORD`는 강한 비밀번호로 변경합니다.
- `ADMIN_SESSION_SECRET`은 긴 랜덤 문자열로 변경합니다.
- `CUSTOMER_PASSWORD`도 임시 비밀번호가 아닌 운영용 비밀번호로 변경합니다.
- `CUSTOMER_COMPANY_ID`는 고객 로그인 세션이 조회할 Supabase `companies.id`와 일치해야 합니다.
- 기존 DB에 이미 `schema.sql`을 실행했다면 `supabase/migrations/20260701_customer_master_upsert.sql`도 한 번 실행합니다.
- 매출 엑셀 업로드와 사업자 기본정보 확장을 적용하려면 `supabase/migrations/20260701_sales_transactions.sql`도 한 번 실행합니다.
- ERP/유통사별 엑셀 매핑 프리셋 저장을 준비하려면 `supabase/migrations/20260701_excel_mapping_presets.sql`도 한 번 실행합니다.
- 회사 출발지에서 거래처까지 티맵 거리/시간/경로 캐시를 저장하려면 `supabase/migrations/20260701_tmap_route_cache.sql`도 한 번 실행합니다.
- 고객사 직원 카카오 가입과 모바일 앱 사용을 준비하려면 `supabase/migrations/20260724_staff_kakao_mobile.sql`도 한 번 실행합니다.
- Supabase RLS 정책은 기본 운영 기준으로 켜져 있으며, 고객사별 사용자 초대와 세부 권한은 다음 운영 단계에서 강화합니다.
- 실제 결제/민감정보를 받기 전에는 개인정보 처리방침과 약관 페이지를 추가합니다.

## 8. 다음 개발 우선순위

1. 고객사 직원 초대와 카카오 가입
2. 모바일 오늘 코스 화면
3. 관리자 업로드 이력 상세 화면
4. 고객사별 사용자 권한 분리
5. 거래처 첨부자료 OCR 자동 입력
6. 사업자 상태 정기 조회 작업
7. 리드 추천 TOP50 필터/검색
8. OpenAI 기반 AI 리포트 문장 고도화
9. Vercel 커스텀 도메인 연결
