# Data Registration (데이터 등록)

## Status
운영 중. 엑셀 업로드/매핑 기반 대량 거래처 등록.

## Goal
엑셀 업로드 또는 수동 입력으로 거래처 원본 데이터를 등록하고, 컬럼 매핑 → 정규화 → 중복확인을 거쳐 거래처 마스터로 적재한다.

## Owner Domain
customer

## Related Domains
없음(단일 도메인 페이지)

## Allowed Files
- `app/page.tsx` (5,220줄 — 대형 파일, 수정 범위를 최소화할 것)
- `components/excel-mapping-preview.tsx`
- `components/data-registration-report.tsx`
- `components/dashboard-consistency-check.tsx`
- `components/mobile-register-workspace.tsx` (모바일 등록은 mobile-register.md와 공유 소유)
- `app/api/customers/route.ts`, `app/api/excel-mapping-presets/route.ts`
- `app/api/upload-history/route.ts`, `app/api/ocr/business-license/route.ts`

## Data Flow

| Source | Used For |
|---|---|
| 엑셀 업로드 | 거래처/매출 대량 등록 |
| 수기 입력 | 단건 등록 |
| OCR 결과 | 사업자등록증 정보 추출 |
| `upload_history` | 저장 이력 |
| `normalized_customers` | 등록 결과 반영 |

## UX Rules
- 좌측 소분류는 행/탭 형태로 간결하게 둔다.
- 화면 빈 공간은 입력/검증 결과에 우선 배분한다.
- 긴 안내 문구 대신 현재 상태와 다음 액션만 보여준다.

## Do Not Touch
- `lib/store.ts`의 lead/sales/delivery 전용 섹션

## Preserve
- 컬럼 매핑 프리셋 저장/재사용
- 중복확인(사업자번호 예외 목록 반영)
- 등록 이력 표 정렬 기능

## Task
_(비어있음)_

## Completion
- TypeScript / lint / build PASS
- 대량 업로드(수백 건) 시 타임아웃 없이 처리되는지 확인

---

## STATUS
ACTIVE

## LAST VERIFIED
2026-09-08

## BUILD
알 수 없음 (사용자/Codex 확인 필요)

## COMPLETED
- [x] 메인 페이지 문제행/최근 등록이력 표 정렬
- [x] 레이아웃 점검 완료(구조적 버그 없음, 사소한 클래스 드리프트만 존재)

## TODO
- [ ] app/page.tsx가 5,220줄로 과대 — 향후 기회가 되면 컴포넌트 분리 검토(지금 당장 리팩터링 지시는 아님)

## KNOWN ISSUES
없음.
