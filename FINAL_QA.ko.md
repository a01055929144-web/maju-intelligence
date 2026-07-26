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
