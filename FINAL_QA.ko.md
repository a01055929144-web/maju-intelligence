# MAJU Intelligence 최종 검수 기록

이 문서는 실배포 전 마지막으로 확인해야 할 검수 기준과 현재 확인 결과를 기록합니다.

## 현재 코드 검증 결과

- TypeScript: `node_modules\.bin\tsc.cmd --noEmit`
- 빌드: `npm run build`
- 공백/충돌 검사: `git diff --check`
- 환경변수 점검: `npm run check:production-env`

## 현재 확인 상태

| 항목 | 상태 | 확인 내용 |
| --- | --- | --- |
| TypeScript | 통과 | 타입 오류 없이 컴파일 확인 |
| Next.js 빌드 | 통과 | 프로덕션 빌드 및 정적/동적 라우트 생성 확인 |
| Git diff 검사 | 통과 | 공백 오류 없음 |
| 환경변수 점검 | 조치 필요 | 로컬 `.env.production.local`의 운영값이 비어 있어 누락으로 감지됨 |
| Supabase SQL | 수동 확인 필요 | `supabase/schema.sql`과 최신 migrations 실행 여부 확인 필요 |
| Vercel 배포 | 수동 확인 필요 | 무료 배포 한도 해제 후 Production 재배포 필요 |

## 실배포 전 필수 확인 경로

1. `/admin/system`
   - Supabase 환경변수, DB 테이블, Storage, 인증값 상태 확인
2. `/`
   - 거래처 마스터 또는 매출 거래내역 등록 흐름 확인
3. `/dashboard`
   - 대표가 보는 거래처, 매출, 운영 지표 확인
4. `/crm/timeline`
   - 거래처 기본정보, 첨부자료, 메모, 방문 기록 확인
5. `/routes/today`
   - 지도, 배송차 필터, 티맵 경유 계산 확인
6. `/mobile/today`
   - 직원 모바일 코스, 적재위치, 배송완료 증빙 흐름 확인

## 운영 헬스체크 API 판정 기준

`/api/health`는 Vercel 배포 후 서비스가 실제 운영 DB와 환경값으로 준비되었는지 확인하는 서버 점검 경로입니다.

| HTTP 상태 | 의미 | 조치 |
| --- | --- | --- |
| `200` | 운영 가능 | `ok:true`, `mode:"production-db"`인지 확인 후 핵심 화면 검수 진행 |
| `503` | 앱은 열리지만 운영 준비 미완료 | 응답의 `blockingCount`, `databaseChecks`, `storageChecks`를 보고 Supabase/env/Storage 설정 보완 |
| `500` | 헬스체크 실행 실패 | Vercel Function Logs에서 stack trace 확인 후 API 또는 환경변수 오류 수정 |

응답에서 우선 확인할 필드는 `ok`, `mode`, `readinessScore`, `blockingCount`, `warningCount`, `databaseChecks`, `storageChecks`입니다.

## 고객사 데이터 기준 진단

`/api/customer/data-consistency?companyId=고객사_ID`는 대시보드, 거래처 원장, 영업·배송 코스, 지도 표시 가능 매장 수가 같은 회사 기준으로 맞는지 확인합니다.

| 확인 항목 | 기대 기준 |
| --- | --- |
| 대시보드 ↔ 거래처 원장 | 거래처 수가 같은 기준으로 표시 |
| 거래처 원장 ↔ 코스 | 코스 매장 수가 거래처 원장 기준으로 생성 |
| 코스 ↔ 지도 표시 가능 | 주소가 있는 매장만 지도에 표시되며 누락 수가 드러남 |
| 히스토리 데이터 | 방문, 메모, 배송완료 기록이 조회 가능 |

응답이 `207`이면 일부 기준이 맞지 않는 상태입니다. `recommendations`에 나온 순서대로 주소 누락, 샘플/캐시 혼입, 업로드 저장 상태를 확인합니다.

## Production 최종 확인표

배포 URL이 확정되면 아래 표에 실제 결과를 기록합니다.

| 경로 | 확인할 내용 | 기대 결과 | 결과 |
| --- | --- | --- | --- |
| `/api/health` | 운영 헬스체크 | `ok:true`, `mode:"production-db"` | 배포 후 확인 |
| `/api/customer/data-consistency?companyId=...` | 고객사 데이터 기준 | 대시보드, 원장, 코스, 지도 수치 일치 | 배포 후 확인 |
| `/admin/login` | 관리자 로그인 | 관리자 콘솔 진입 | 배포 후 확인 |
| `/admin/system` | 환경변수, DB, Storage | 필수 조치 0건 | 배포 후 확인 |
| `/admin/companies` | 고객사 생성/수정 | companyId 기준 미리보기 가능 | 배포 후 확인 |
| `/dashboard/login` | 고객사 로그인 | 고객사 대시보드 진입 | 배포 후 확인 |
| `/` | 데이터 등록 | 매핑, 검증, 서버 반영 상태 표시 | 배포 후 확인 |
| `/crm/timeline` | 거래처 히스토리 | 기본정보, 첨부자료, 메모 조회 | 배포 후 확인 |
| `/routes/today` | 영업·배송 코스 | 지도, 차량 필터, TMAP 경유 계산 | 배포 후 확인 |
| `/mobile/today` | 직원 모바일 | 오늘 코스와 완료 증빙 기록 | 배포 후 확인 |

## Production 통과 판정

- 위 8개 경로가 모두 접속되어야 합니다.
- 서버 저장이 필요한 화면은 Supabase에 실제 row가 생성되어야 합니다.
- 오류가 나면 Digest, URL, 시간, companyId를 기록하고 운영 로그 확인 순서대로 추적합니다.
- 모든 항목 통과 후에 고객사 현장 테스트 링크를 전달합니다.

## 배포 전 남은 조치

1. Vercel Production Environment Variables에 운영값 입력
2. Supabase SQL Editor에서 `supabase/schema.sql`과 필요한 migration 실행
3. `customer-attachments` Storage 버킷 생성 및 업로드 테스트
4. `CUSTOMER_COMPANY_ID`가 실제 `companies.id`와 일치하는지 확인
5. Kakao Developers Web 도메인에 Production URL 등록
6. TMAP API 키로 실제 경유 계산 호출 확인

## 통과 기준

- `/admin/system`의 필수 조치가 0건이어야 합니다.
- 데이터 등록 후 `persisted:true` 또는 서버 저장 완료 메시지가 보여야 합니다.
- 등록된 거래처 수가 대시보드, 거래처 히스토리, 영업·배송 코스에서 같은 기준으로 보여야 합니다.
- 매장 상세에서 첨부자료와 메모가 저장 후 다시 조회되어야 합니다.
- 모바일 배송완료 기록이 거래처 히스토리의 메모·첨부자료에 연결되어야 합니다.

## 오류 발생 시 기록할 값

- 오류 URL
- 발생 시간
- 화면 Digest 번호
- 로그인 계정 유형: 관리자 또는 고객사
- companyId
- 직전 작업: 업로드, 저장, 지도, 경유 계산, 첨부자료, 모바일 완료 중 하나

## 운영 로그 확인 순서

1. Vercel Logs에서 오류 시간대의 Function 로그를 확인합니다.
2. Supabase Logs에서 테이블 누락, RLS, Storage 권한, PostgREST 오류를 확인합니다.
3. `/admin/system`에서 환경변수와 DB 테이블 카운트를 확인합니다.
4. `/admin/companies`에서 해당 고객사 companyId 기준 미리보기로 재현합니다.
5. 수정 후 `npm run build`와 핵심 화면 6개 경로를 다시 확인합니다.
