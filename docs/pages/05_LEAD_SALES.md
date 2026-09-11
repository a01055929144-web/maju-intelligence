> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/leads.md`를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 05. 신규리드·아웃바운드 영업 | Lead Sales

## PAGE TITLE

신규리드·아웃바운드 영업

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Lead sales package v1

## STATUS SUMMARY

신규 리드, 영업 리드, 인허가 데이터, 외부 장소 정보, 아웃바운드 영업 흐름을 담당한다.

## GOAL

신규 개업/영업 가능 매장을 발굴하고, 전화/DM/견적/거래처 전환까지 이어지는 리드 영업 흐름을 만든다.

## OWNER DOMAIN

lead

## RELATED DOMAINS

customer, sales, analytics, route

## PRIMARY ROUTES

- `/dashboard` 내부 리드 탭
- `/leads/permits`

## ALLOWED FILES

- `components/permit-leads-view.tsx`
- `components/sales-route-map-workspace.tsx`
- `app/leads/permits/page.tsx`
- `app/api/leads/*`
- `lib/store.ts` lead 관련 함수

## DO NOT TOUCH

- `app/admin/**`
- `app/api/auth/**`
- `app/revenue/**` unless estimate/sales conversion is explicitly in scope
- Existing customer marker logic unless lead-marker integration is the task

## PRESERVE

- Existing permit lead API routes
- Existing lead actions
- Existing lead conversion flow
- Existing map filters
- Existing lead status values

## COMPLETED

- [x] 신규 리드 탭
- [x] 영업 리드 탭
- [x] 인허가 데이터 기반 리드 목록
- [x] 개시일 기간 필터
- [x] 업종 필터 기본 구조

## TODO

- [ ] 리드 상세 정보를 기존 거래처 카드 수준으로 확장
- [ ] 네이버/카카오/구글 장소/리뷰 정보 보강
- [ ] 인스타 ID 검색 정확도 개선
- [ ] 영업 우선순위 점수와 타당성 표시
- [ ] 견적 품목 10/20/30개 선택 및 저장
- [ ] 지도 마커와 우측 리드 목록 완전 동기화

## Data Flow

| Source | Used For |
| --- | --- |
| permit leads | 신규 리드 기본 데이터 |
| public permit APIs | 금일/금주/금월 신규 사업장 |
| place search APIs | 주소/전화/장소 링크 보강 |
| reviews/menu signals | 견적 품목 추천 |
| lead actions | 전화/DM/견적/후속 상태 |

## UX RULES

- 신규 리드와 기존 거래처의 카드 정보 밀도를 맞춘다.
- 지도 마커와 우측 리드 목록은 항상 같은 필터 기준을 사용한다.
- 추천 사유는 짧고 근거 중심으로 표시한다.

## VERIFICATION

- 신규/영업 리드 토글
- 업종/기간/상태 필터
- 지도 마커 동기화
- 상세 정보 표시
- DM/전화/견적 액션
- 거래처 전환
