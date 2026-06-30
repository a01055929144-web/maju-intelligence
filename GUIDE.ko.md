# MAJU Intelligence v1 개발/운영 가이드

## 1. 현재 앱 구조

MAJU Intelligence v1은 Next.js 기반 웹앱입니다.

주요 화면:

- `/`: 사용자 앱
- `/dashboard`: 고객사 대시보드
- `/dashboard/login`: 고객사 로그인
- `/reports/[id]`: 분석 리포트 상세
- `/routes/today`: 오늘의 방문 계획
- `/crm/timeline`: 방문 결과/CRM 타임라인
- `/revenue/pipeline`: 예상 매출 파이프라인
- `/assistant`: AI Sales Assistant 후속 초안
- `/admin`: 관리자 콘솔
- `/admin/system`: 운영 설정/시스템 점검
- `/admin/login`: 관리자 로그인

주요 API:

- `GET /api/briefing`: 오늘의 AI 브리핑
- `GET /api/report`: 최신 AI 리포트
- `GET /api/leads`: 추천 리드
- `PATCH /api/leads/[id]/status`: 추천 리드 상태 변경
- `GET /api/routes/today`: 방문 예정 리드 기반 오늘의 방문 계획
- `POST /api/visits`: 방문 결과 기록
- `GET /api/visits/timeline`: 방문 결과 타임라인
- `GET /api/revenue/pipeline`: 방문 결과 기반 예상 매출 파이프라인
- `GET /api/assistant/drafts`: 방문 결과 기반 후속 메시지/요약/견적 메모 초안
- `GET /api/admin`: 관리자 대시보드 데이터
- `GET /api/admin/system`: 운영 설정/환경변수/서비스 상태 점검
- `POST /api/analyze`: 엑셀 분석 및 저장
- `POST /api/admin/login`: 관리자 로그인
- `POST /api/admin/logout`: 관리자 로그아웃
- `GET /api/customer/me`: 고객사 세션 확인
- `GET /api/customer/dashboard`: 고객사 스코프 대시보드 데이터
- `POST /api/customer/login`: 고객사 로그인
- `POST /api/customer/logout`: 고객사 로그아웃

## 2. 로컬 실행

```bash
npm install
npm run dev
```

로컬 주소:

- 사용자 앱: `http://localhost:3000`
- 고객사 대시보드: `http://localhost:3000/dashboard`
- 고객사 로그인: `http://localhost:3000/dashboard/login`
- 관리자: `http://localhost:3000/admin`
- 관리자 로그인: `http://localhost:3000/admin/login`

## 3. 기본 관리자 계정

로컬 개발용 기본값:

- 이메일: `admin@maju.local`
- 비밀번호: `maju-admin-2026`

실서버에서는 반드시 환경변수로 바꿔야 합니다.

```bash
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=strong-production-password
ADMIN_SESSION_SECRET=random-long-secret
CUSTOMER_EMAIL=owner@your-customer.com
CUSTOMER_PASSWORD=strong-customer-password
```

## 4. 실서버 DB 연결

Supabase를 사용합니다.

필수 환경변수:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
```

DB 생성:

1. Supabase 프로젝트 생성
2. SQL Editor 열기
3. `supabase/schema.sql` 실행
4. Vercel 환경변수 등록
5. 재배포

## 5. 데이터 적재 흐름

엑셀 업로드 시 저장되는 데이터:

1. 업로드 파일 메타데이터
2. 컬럼 매핑
3. raw rows
4. normalized customers
5. customer import job
6. AI report
7. health score snapshot
8. lead recommendations
9. admin audit log

Supabase 환경변수가 없으면 샘플 데이터 fallback으로 작동합니다.

사용자 화면에서는 다음 처리 단계가 표시됩니다.

1. 파일 수신
2. 컬럼 매핑
3. Raw 데이터 적재
4. 거래처 정제
5. Health Score 계산
6. AI 리포트 생성

## 6. 관리자 페이지에서 확인할 것

관리자 페이지는 다음을 확인하기 위한 화면입니다.

- 고객사 수
- 업로드 파일 수
- 처리 row 수
- 평균 Health Score
- 분석 작업 목록
- 데이터 품질
- Health Score 가중치
- 추천 리드 큐
- 백엔드 엔드포인트
- 업로드/분석 이력

고객사 대시보드는 다음을 확인하기 위한 화면입니다.

- 현재 거래처 수
- 이번주 기회
- Company Health Score
- 오늘의 AI 제안
- 추천 리드 TOP6
- 추천 리드 상태 변경
- 최근 업로드 이력
- 업로드 이력에서 리포트 상세 보기

리드 상태:

- 오늘 추천
- 이번주 추천
- 검토중
- 방문 예정
- 계약 가능
- 제외

방문 계획:

- `방문 예정`, `오늘 추천`, `계약 가능` 상태의 리드를 모읍니다.
- 점수가 높은 순서대로 최대 12곳을 뽑습니다.
- 지역별로 묶어서 오늘 방문 순서를 보여줍니다.
- 방문 후 결과를 `방문 완료`, `관심 있음`, `견적 요청`, `보류`, `실패`로 기록합니다.

CRM 타임라인:

- 방문 결과를 시간순으로 봅니다.
- 견적 요청 수, 관심 리드 수, 예상 월매출을 확인합니다.
- 다음 액션을 기록해 후속 영업의 기준 데이터로 사용합니다.

Revenue Intelligence:

- 견적 요청, 관심 있음, 보류, 실패 상태를 매출 파이프라인으로 봅니다.
- 예상 총매출과 확률 가중 매출을 나눠서 보여줍니다.
- 대표가 이번 달 추가매출 후보를 빠르게 판단할 수 있게 합니다.

AI Sales Assistant:

- 방문 결과를 바탕으로 방문 요약을 만듭니다.
- 관심 리드에는 후속 메시지 초안을 만듭니다.
- 견적 요청 리드에는 견적 요청 메모를 만듭니다.

운영 설정 점검:

- Supabase 연결 모드를 확인합니다.
- 필수 환경변수 누락 여부를 확인합니다.
- 관리자/고객사 인증이 기본값인지 운영값인지 확인합니다.
- 실서버 전환 체크리스트를 확인합니다.

## 7. 배포 순서

권장 배포 순서:

1. GitHub 저장소 생성
2. 코드 push
3. Supabase 프로젝트 생성
4. `supabase/schema.sql` 실행
5. Vercel에서 GitHub 저장소 import
6. 환경변수 등록
7. 배포
8. 실제 엑셀 업로드 테스트

## 8. 중요한 운영 원칙

- 고객사 데이터는 반드시 `company_id`로 분리합니다.
- 고객사 API는 로그인 세션의 `companyId`를 기준으로 조회합니다.
- 원본 데이터와 정제 데이터를 모두 저장합니다.
- 분석 결과만 저장하지 않습니다.
- 산식이 바뀌면 기존 raw data로 재분석할 수 있어야 합니다.
- 관리자 행동은 감사 로그에 남깁니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 클라이언트에 노출하면 안 됩니다.
