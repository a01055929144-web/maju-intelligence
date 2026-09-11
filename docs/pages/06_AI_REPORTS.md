> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/sales-assistant.md` + `docs/pages/reports.md`를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 06. AI 영업·리포트 | AI Reports

## PAGE TITLE

AI 영업·리포트

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

AI reports package v1

## STATUS SUMMARY

AI 영업 도우미, 리포트, 제안서/견적서 생성 흐름을 담당한다.

## GOAL

실제 거래처/리드/매출 데이터를 기반으로 실행 가능한 영업 문구, 견적, 리포트를 생성한다.

## OWNER DOMAIN

analytics

## RELATED DOMAINS

lead, customer, sales

## PRIMARY ROUTES

- `/assistant`
- `/reports/[id]`

## ALLOWED FILES

- `app/assistant/page.tsx`
- `app/reports/[id]/page.tsx`
- `app/api/assistant/drafts/route.ts`
- `app/api/analyze/route.ts`
- `app/api/report/route.ts`
- `components/data-registration-report.tsx`

## DO NOT TOUCH

- `app/admin/**`
- `app/api/auth/**`
- `supabase/**` unless report persistence requires a migration
- Map marker rendering unless report links are explicitly in scope

## PRESERVE

- Existing report pages
- Existing assistant draft route
- Existing data registration report
- Existing saved report behavior

## COMPLETED

- [x] AI 영업 페이지
- [x] 리포트 상세 페이지
- [x] 데이터 등록 후 리포트 연결
- [x] 초안 생성 API 기본 구조

## TODO

- [ ] Mock/실제 데이터 구분 더 명확화
- [ ] 리드별 DM/전화 문구 저장
- [ ] 메뉴/리뷰 기반 견적 품목 추천
- [ ] 견적서 이미지/PDF 생성
- [ ] AI 결과 복사/저장/재사용 UX 정리

## Data Flow

| Source | Used For |
| --- | --- |
| normalized_customers | 기존 거래처 분석 |
| permit leads | 신규 리드 분석 |
| sales_transactions | 매출/품목 분석 |
| reviews/menu info | 견적 품목 추천 |
| assistant drafts | 영업 문구 저장 |

## UX RULES

- AI 결과는 복사/저장/다음 액션 버튼을 함께 제공한다.
- 설명보다 결과물과 실행 버튼을 우선한다.
- Mock 결과와 실제 데이터 결과를 명확히 구분한다.

## VERIFICATION

- 초안 생성
- 복사
- 저장
- 리포트 보기
- PDF/이미지 생성 기능 연결 시 다운로드 확인
