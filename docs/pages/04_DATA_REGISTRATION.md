> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/data-registration.md` + `docs/pages/revenue-transactions.md` + `docs/pages/customer-history.md`를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 04. 데이터 등록·저장 이력 | Data Registration

## PAGE TITLE

데이터 등록·저장 이력

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Data registration package v1

## STATUS SUMMARY

거래처 등록, 매출 등록, OCR, 엑셀 업로드, 저장 이력 확인을 담당한다.

## GOAL

대량 등록, 수기 등록, OCR 등록, 저장 이력을 파편화 없이 빠르고 명확하게 처리한다.

## OWNER DOMAIN

customer

## RELATED DOMAINS

sales, analytics, route

## PRIMARY ROUTES

- `/`
- `/customers/data`

## ALLOWED FILES

- `app/page.tsx`
- `app/customers/data/page.tsx`
- `components/mobile-register-workspace.tsx`
- `components/data-registration-report.tsx`
- `components/sales-transaction-matcher.tsx`
- `components/sales-transaction-table.tsx`
- `app/api/upload-history/route.ts`
- `app/api/ocr/business-license/route.ts`
- `app/api/revenue/transactions/*`

## DO NOT TOUCH

- `app/admin/**`
- `app/api/auth/**`
- `components/sales-route-map-workspace.tsx` unless map reflection is explicitly in scope
- `supabase/**` unless DB persistence changes are explicitly requested

## PRESERVE

- Existing Excel upload
- Existing manual registration
- Existing OCR endpoint
- Existing duplicate warning
- Existing upload history

## COMPLETED

- [x] 거래처 등록
- [x] 매출 등록
- [x] 저장/이력 영역
- [x] 모바일 빠른 등록
- [x] OCR 진입점

## TODO

- [ ] 좌측/상단 중복 탭 추가 정리
- [ ] 등록 속도 병목 확인
- [ ] 첨부파일 업로드 누락 방지
- [ ] 10/30/50/100개 보기와 페이지 이동 일관화
- [ ] 등록 후 지도/원장 반영 상태 즉시 표시

## Data Flow

| Source | Used For |
| --- | --- |
| Excel upload | 거래처/매출 대량 등록 |
| manual input | 단건 등록 |
| OCR result | 사업자등록증 정보 추출 |
| upload_history | 저장 이력 |
| normalized_customers | 등록 결과 |
| sales_transactions | 매출 원장 |

## UX RULES

- 좌측 소분류는 행/탭 형태로 간결하게 둔다.
- 화면 빈 공간은 입력/검증 결과에 우선 배분한다.
- 긴 안내 대신 현재 상태와 다음 액션만 보여준다.

## VERIFICATION

- 엑셀 업로드
- 수기 등록
- OCR 선택 등록
- 중복 방지
- 저장 이력 반영
- 지도/원장/매출 화면 반영
