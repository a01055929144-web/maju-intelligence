# MAJU Intelligence 운영 전환 릴리즈 노트

## 릴리즈 목적

MAJU Intelligence를 MVP 설명용 화면에서 실제 고객사 테스트가 가능한 운영형 서비스 구조로 전환합니다. 핵심은 거래처 기본정보, 매출 거래내역, 영업·배송 코스, 모바일 현장 기록, 관리자 점검 흐름이 같은 고객사 데이터 기준으로 이어지는 것입니다.

## 준비된 운영 기능

- 관리자와 고객사 운영계정 분리
- 고객사별 회사 생성, 로그인 계정 관리, 미리보기 진입
- 거래처 마스터 수기 등록, 주소 검색, 사업자번호 검증
- 엑셀 업로드 후 전체 행 미리보기와 ERP 컬럼 매핑
- 매출 거래내역 업로드와 거래처 key 기반 분석 준비
- 거래처 히스토리에서 기본정보, 첨부자료, 메모, 방문 기록 관리
- 배송차별/매장등급별 지도 마커 표시
- 회사 출발지 또는 현위치 기준 영업·배송 코스 확인
- TMAP 경유 계산 API 연결 구조
- 모바일 직원 가입, 오늘 코스, 배송완료 증빙 기록 흐름
- 관리자 시스템 점검, 환경변수 점검, 최종 QA 기록

## 배포 전 반드시 확인할 항목

1. Vercel Production Environment Variables 입력
2. Supabase `schema.sql`과 최신 migration 실행
3. `customer-attachments` Storage 버킷 생성
4. `CUSTOMER_COMPANY_ID`와 Supabase `companies.id` 일치 확인
5. Kakao Developers Web 도메인 등록
6. TMAP API 키로 실제 경유 계산 확인
7. `npm run check:production-env` 결과 확인
8. `npm run build` 통과 확인

## 실사용 검증 경로

- `/admin/system`: DB, Storage, 인증, 환경변수 점검
- `/admin/companies`: 고객사 생성과 계정 분리 확인
- `/`: 거래처 마스터와 매출 거래내역 등록
- `/dashboard`: 대표용 운영 지표 확인
- `/crm/timeline`: 거래처 원장, 첨부자료, 메모 확인
- `/routes/today`: 지도, 배송차 필터, 티맵 경유 계산 확인
- `/mobile/today`: 직원 모바일 코스와 배송완료 기록 확인

## 현재 알려진 제약

- 로컬 `.env.production.local`에는 운영값이 비어 있어 `npm run check:production-env`는 누락을 정상적으로 감지합니다.
- Vercel 무료 플랜 배포 한도에 걸린 경우, 한도 해제 후 Production 재배포가 필요합니다.
- OCR은 필수 기능이 아니라 사업자등록증 입력을 돕는 보조 기능입니다.
- 카카오톡 실제 메시지 발송은 현재 기록/복사 흐름이며, 발송 API 연동은 후속 작업입니다.
- 개인정보와 신분증 저장은 운영 전 약관, 보관 정책, 마스킹 기준이 필요합니다.

## 배포 후 장애 대응 기준

1. 화면 URL, 발생 시간, Digest 번호, companyId를 기록합니다.
2. Vercel Logs에서 Function/API route 오류를 확인합니다.
3. Supabase Logs에서 PostgREST, RLS, Storage 권한 오류를 확인합니다.
4. `/admin/system`에서 환경변수와 테이블 카운트를 다시 확인합니다.
5. 수정 후 핵심 경로 6개를 재검증합니다.

## 다음 릴리즈 후보

- 카카오 로그인/초대 플로우 실제 운영 안정화
- 직원별 모바일 권한과 활동 이력 상세화
- 첨부자료 개인정보 마스킹과 보관 기간 정책
- OCR 공급자 실제 연결과 검수 UI 고도화
- 지도/경유 계산 결과 캐시와 비용 관리
- 고객사별 감사 로그와 변경 이력 추적
