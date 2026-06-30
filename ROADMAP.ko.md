# MAJU Intelligence v1 한글 로드맵

MAJU는 단순 CRM이 아니라 식자재 유통사의 영업 데이터를 분석하는 AI Sales Intelligence Platform을 목표로 합니다.

첫 버전의 목표는 완벽한 AI가 아닙니다. 대표가 엑셀을 올렸을 때 “우리 회사의 영업 상태가 이렇게 보이는구나”라고 바로 이해할 수 있는 진단 리포트를 만드는 것입니다.

## 제품 방향

현재 인식:

- 지도 CRM

목표 인식:

- AI Sales Intelligence Platform
- AI Company Diagnosis
- AI Lead Recommendation
- AI Route Optimization
- AI Sales Assistant
- 영업 데이터 회사

## Phase 0 - MVP 기반

목표: 샘플 데이터와 엑셀 업로드만으로 첫 진단 경험을 증명합니다.

범위:

- Next.js 웹앱
- 오늘의 AI 브리핑
- 엑셀 업로드
- 필수 컬럼 매핑
- 거래처 데이터 정제
- Company Health Score 산식
- MAJU AI Report
- 관리자 페이지
- 샘플 데이터 fallback

완료 기준:

- 사용자가 앱을 열고 엑셀 업로드 또는 샘플 데이터로 회사 진단 리포트를 볼 수 있습니다.
- 관리자가 분석 작업, 데이터 품질, 점수 가중치, 추천 리드 큐를 볼 수 있습니다.

현재 상태:

- 로컬 MVP 구현 완료
- 실서버 DB 저장 구조 초안 구현 완료

## Phase 1 - Production Data Engine

목표: 실제 고객사 데이터를 안전하게 저장하고 재분석할 수 있는 구조를 만듭니다.

핵심 테이블:

- `companies`: 고객사
- `app_users`: 사용자
- `company_members`: 회사별 멤버/권한
- `uploaded_files`: 업로드 파일 메타데이터
- `customer_imports`: 엑셀 업로드 작업
- `column_mappings`: 컬럼 매핑 기록
- `raw_customer_rows`: 원본 행 데이터
- `normalized_customers`: 정제된 거래처 데이터
- `ai_reports`: AI 리포트 JSON
- `health_score_snapshots`: Health Score 스냅샷
- `lead_recommendations`: 추천 리드
- `admin_audit_logs`: 관리자/시스템 감사 로그

데이터 흐름:

1. 엑셀 업로드
2. 원본 파일 메타데이터 저장
3. 컬럼 매핑 저장
4. raw rows 저장
5. normalized rows 저장
6. 중복 탐지
7. Health Score 생성
8. AI Report 생성
9. 추천 리드 생성
10. 관리자 감사 로그 저장

완료 기준:

- 모든 업로드가 추적 가능합니다.
- 산식이 바뀌어도 과거 데이터를 재분석할 수 있습니다.
- 고객사별 데이터가 절대 섞이지 않습니다.

현재 상태:

- Supabase 스키마 초안 구현 완료
- `/api/analyze`가 raw rows, 컬럼 매핑, 파일명, 사용자명, 정제 rows를 받을 수 있습니다.
- Supabase 환경변수가 없으면 로컬 샘플 데이터로 작동합니다.

## Phase 2 - 계정과 권한

목표: 실제 관리자와 고객사 사용자를 구분합니다.

역할:

- MAJU super admin
- MAJU operator
- 고객사 owner
- 고객사 member

범위:

- 관리자 로그인
- 고객사 로그인
- 회사별 멤버십
- 역할 기반 접근 제어
- 회사별 데이터 조회
- 카카오 로그인 준비

완료 기준:

- 관리자는 전체 고객사를 볼 수 있습니다.
- 고객사 사용자는 본인 회사 데이터만 볼 수 있습니다.
- 중요한 행동은 감사 로그에 남습니다.

## Phase 3 - Company Diagnosis v1

목표: 영업 데모에서 대표가 바로 납득하는 진단 리포트를 만듭니다.

리포트 섹션:

- Company Health Score
- 영업력
- 배송효율
- CRM관리
- 신규영업
- 거래처 집중도
- 리스크
- 지역 분포
- 업종 분석
- White Space
- 잠재매출
- 추천 TOP10

완료 기준:

- 대표가 3분 안에 회사 상태를 이해할 수 있습니다.
- 이번 주 어디를 공략해야 하는지 명확한 액션이 나옵니다.

## Phase 4 - Lead Intelligence

목표: 다음에 영업할 곳을 추천합니다.

범위:

- 신규 리드 수집
- 리드 스코어링
- 지역 기반 추천
- 업종 적합도
- 배송반경 적합도
- 예상매출 가정값
- TOP50 추천 큐
- 리드 상태 관리

## Phase 5 - Route Intelligence

목표: 추천 리드를 영업/배송 동선과 연결합니다.

범위:

- 방문 계획
- 배송 동선 묶음
- 지역 기반 동선 제안
- 티맵/카카오맵/네이버 지도 연동
- 오늘 방문 루트 생성

## Phase 6 - CRM Intelligence

목표: Intelligence가 유용해진 뒤 CRM을 붙입니다.

범위:

- 거래처 히스토리
- 담당자
- Task
- 일정
- 영업 퍼널
- 방문 메모
- 후속 알림

## Phase 7 - Revenue Intelligence

목표: 매출 성장/감소/이탈 위험을 감지합니다.

범위:

- 매출 스냅샷
- 매출 감소 알림
- 이탈 위험 거래처
- 성장 가능 거래처
- 교차판매 추천
- 월간 대표 리포트

## Phase 8 - AI Sales Assistant

목표: 영업 담당자의 실행 시간을 줄입니다.

범위:

- 견적서 초안
- 영업 스크립트
- 방문 요약
- 후속 메시지 초안
- Task 자동 생성

## Phase 9 - Network Intelligence

목표: 익명화된 산업 데이터 기반의 데이터 회사가 됩니다.

범위:

- 익명화 시장 데이터
- 지역별 시장 트렌드
- 업종별 성공 패턴
- 벤치마킹 리포트
- 시장 White Space 분석

## 지금부터의 구현 순서

1. 관리자 로그인과 세션
2. 관리자 페이지 보호
3. 고객사 계정 모델
4. 회사별 데이터 조회
5. 업로드 파이프라인 UI 개선
6. Supabase 실서버 연결
7. Vercel 배포
8. 실제 엑셀 업로드 테스트

현재 진행:

- 관리자 로그인과 세션 구현 완료
- 관리자 페이지/API 보호 구현 완료
- 고객사 로그인과 고객사 대시보드 구현 완료
- 고객사 세션의 `companyId` 기준 대시보드 조회 구현 완료
- 엑셀 업로드 파이프라인 진행 UI 구현 완료
- 고객사/관리자 업로드 이력 화면 구현 완료
- 업로드 이력 기반 리포트 상세 페이지 구현 완료
- 추천 리드 상태 변경 기능 구현 완료
- 방문 예정 리드 기반 오늘의 방문 계획 구현 완료
- 방문 결과 기록 기능 구현 완료
- 방문 결과/CRM 타임라인 구현 완료
- Revenue Intelligence v1 예상 매출 파이프라인 구현 완료
- AI Sales Assistant v1 후속 초안 생성 구현 완료
- 관리자 운영 설정/시스템 점검 화면 구현 완료
