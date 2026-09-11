> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/map-and-route.md`를 대신 보세요(같은 범위 + STATUS 보드 + 이번 세션 실제 작업 이력 포함). 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 01. 지도 홈 OS | Map Home

## PAGE TITLE

지도 홈 OS

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Map OS package v1

## STATUS SUMMARY

지도 홈은 MAJU의 메인 OS다. 사용자는 지도에서 기존 거래처, 신규 리드, 영업 리드, 배송 차량, 코스 상태를 먼저 확인해야 한다.

## GOAL

기존 거래처, 신규 리드, 영업 리드, 차량 위치, 코스 정보를 하나의 지도 중심 화면에서 관리한다.

## OWNER DOMAIN

route

## RELATED DOMAINS

customer, lead, delivery, organization

## PRIMARY ROUTES

- `/dashboard`
- `/map/fullscreen`

## ALLOWED FILES

- `app/dashboard/page.tsx`
- `app/map/fullscreen/page.tsx`
- `components/sales-route-map-workspace.tsx`
- `components/sales-route-map-workspace-loader.tsx`
- `lib/customer-navigation.ts`

## DO NOT TOUCH

- `app/admin/**`
- `app/api/auth/**`
- `app/revenue/**`
- `supabase/**` unless the task explicitly requires a migration

## PRESERVE

- Existing customer markers
- Existing lead markers
- Existing Kakao map loading
- Existing route path behavior
- Existing customer detail drawer
- Existing staff location fetch

## COMPLETED

- [x] 지도 홈을 기본 진입 화면으로 유지
- [x] 좌측 내비게이션 기준 정리
- [x] 거래처/리드/코스 탭 구조 구현
- [x] 전체 지도 화면 분리

## TODO

- [ ] 리드 버튼 선택 시 우측 목록을 지도 마커 기준으로 자동 동기화
- [ ] 녹색/회색/차량/리드 마커 범례 고정
- [ ] 기존 거래처와 리드 카드 정보 밀도 통일
- [ ] 차량 실시간 위치를 더 눈에 띄게 표시
- [ ] 모바일 폭에서 상단 컨트롤 겹침 점검

## Data Flow

| Source | Used For |
| --- | --- |
| normalized_customers | 기존 거래처 마커/목록 |
| permit_leads / lead 관련 테이블 | 신규 리드/영업 리드 |
| staff_locations | 실시간 차량/직원 위치 |
| route_distance_cache | 거리/시간 |
| company settings | 출발지, 메시지, 기준값 |

## UX RULES

- 첫 화면은 지도 비중을 가장 크게 둔다.
- 보조 패널은 접기/펼치기 가능해야 한다.
- 마커 색상과 의미를 명확히 고정한다.
- 카드 설명은 최소화하고 상태값, 액션 버튼 중심으로 구성한다.

## VERIFICATION

- 지도 로딩
- 마커 표시
- 리드/거래처 토글
- 우측 패널 동기화
- 전체 지도 열기
- 모바일 폭에서 버튼 겹침 없음
