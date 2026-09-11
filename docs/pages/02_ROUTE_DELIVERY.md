> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. 데스크톱 코스/경로는 `docs/pages/map-and-route.md`, 모바일 현장 흐름은 `docs/pages/mobile-today.md`를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 02. 영업·배송 코스 | Route Delivery

## PAGE TITLE

영업·배송 코스

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Route and delivery package v1

## STATUS SUMMARY

영업·배송 코스와 모바일 현장 실행 흐름을 담당한다.

## GOAL

담당자별 실제 코스, 차량 위치, 배송완료, 사진/메모 저장이 끊기지 않는 현장 운영 흐름을 만든다.

## OWNER DOMAIN

delivery

## RELATED DOMAINS

route, customer, organization

## PRIMARY ROUTES

- `/routes/today`
- `/mobile/today`

## ALLOWED FILES

- `app/routes/today/page.tsx`
- `app/mobile/today/page.tsx`
- `components/today-course-view.tsx`
- `components/route-sequence-action.tsx`
- `components/route-distance-action.tsx`
- `components/route-batch-distance-action.tsx`
- `components/mobile-route-action-panel.tsx`
- `components/mobile-delivery-proof-panel.tsx`
- `components/mobile-loading-attachment-panel.tsx`
- `components/mobile-location-reporter.tsx`

## DO NOT TOUCH

- `app/admin/**`
- `app/revenue/**`
- `app/api/auth/**` unless staff mapping/login is explicitly in scope
- `components/permit-leads-view.tsx` unless route-lead integration is explicitly in scope

## PRESERVE

- Existing GPS reporting
- Existing route order
- Existing route distance cache
- Existing delivery proof upload
- Existing mobile bottom navigation

## COMPLETED

- [x] 모바일 오늘 코스 화면
- [x] 배송완료 사진/메모 저장
- [x] 적재위치 사진/영상 업로드
- [x] 담당자별 코스 필터 기본 적용
- [x] 현장 액션 버튼 단순화

## TODO

- [ ] 차량 위치가 지도에서 더 잘 보이도록 표시 강화
- [ ] 실제 GPS 이동 이력 기반 route trace 저장/표시
- [ ] 일자별 배송코스 이력과 인건비/물류비 추산 연결
- [ ] 모바일에서 네트워크 실패 시 재시도 UI 개선
- [ ] 배송완료 후 문자/알림 발송 결과를 현장 화면에 명확히 표시

## Data Flow

| Source | Used For |
| --- | --- |
| normalized_customers | 코스 대상 매장 |
| route_plan_confirmations | 확정 순서 |
| route_distance_cache | 거리/시간 |
| staff_locations | 실시간 위치 |
| customer_attachments | 배송완료/적재위치 사진 |
| customer_notes / visits | 방문 기록 |

## UX RULES

- 모바일은 `코스 -> 매장 -> 지도/전화 -> 적재 -> 완료` 흐름을 유지한다.
- 하단 버튼은 4개 이하로 유지한다.
- 현장에서는 긴 설명보다 큰 버튼과 명확한 상태가 우선이다.

## VERIFICATION

- 담당자 로그인 시 자기 코스만 표시
- 코스 순서 유지
- 지도/전화/주소/완료 버튼 동작
- 사진 업로드 후 원장 반영
- GPS 최신 위치 저장/표시
