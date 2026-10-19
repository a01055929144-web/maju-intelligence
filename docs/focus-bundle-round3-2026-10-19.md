# 3차 묶음 결과 — 직원 이름 · 지도 리드 표시 · 설정 분리

## 직원 표시 이름

회사별 표시 이름은 `resolveCompanyStaffDisplayName`에서 결정한다.

1. 가입 완료 초대의 `staff_invitations.employee_name`(관리자 입력)
2. 값이 없을 때만 `app_users.name`(소셜 프로필)
3. 둘 다 없으면 `이름 미등록 직원`

`app_users.name`은 소셜 프로필 원본으로 유지한다. 소셜 재로그인 upsert는 기존 이름을 보존하며 회사 표시 이름으로 갱신하지 않는다. 기존 운영 데이터는 수정하지 않았다.

| 표시 위치 | 변경 내용 |
| --- | --- |
| 설정 직원 목록 | 초대 이름 우선, 이름 옆 `수정` 버튼 상시 노출 |
| 권역 기본 담당자 | `getCompanyStaffMemberOptions` 공통 해석 결과 사용 |
| 호차 기본 기사 | 같은 공통 직원 선택지 사용 |
| 거래처 담당자 선택·ID 표시 | 공통 직원 선택지 및 ID 조인 표시 이름 사용 |
| 지도 라이브 직원 | 초대 이름 → 소셜 이름 순서로 표시 |
| 오늘 코스·GPS·리드 행동 작성자 | 요청마다 최신 회사 표시 이름을 세션 운영 이름으로 보강 |
| 리드→거래처 담당자 추천 | 공통 직원 선택지 사용 |
| 모바일 가입 확인 | `이 이름으로 등록됩니다` 안내 추가 |

장기 모델은 [company-member-display-name.sql](sql-drafts/company-member-display-name.sql)에 초안으로만 제안했다. 운영 DB에는 실행하지 않았다.

## 지도 리드 표시 저장

- 패널: `maju:map-panel-mode:v1`
- 리드 마커 표시: `maju:map-leads-visible:v1`

두 상태를 분리했다. 새 브라우저 기본값은 리드 꺼짐이다. 과거 `newLead`/`salesLead` 패널 값은 거래처 패널로만 이관하고 리드를 자동으로 켜지 않는다. 저장소 접근은 모두 `try/catch`로 보호한다.

## 설정 페이지 구조

| 새 주소 | 데이터 |
| --- | --- |
| `/dashboard/settings/company` | 회사·출발지·문자·텔레그램. 보류 플래그가 켜진 회사만 견적·KPI |
| `/dashboard/settings/staff` | 직원·권한·담당 업무. 거래처 전체 대신 담당자명·차량명만 경량 조회 |
| `/dashboard/settings/routes` | 권역, 호차, 차량, 공통 직원 표시 이름 |
| `/dashboard/settings/advanced` | 사업자번호 예외, 회사 이용 종료. 대표만 접근 |

| 옛 링크 | 이동 위치 |
| --- | --- |
| `/dashboard/settings` | 회사 정보 |
| `?section=company`, `#company-settings` | 회사 정보 |
| `#staff-settings` | 직원 관리 |
| `?section=tms`, `#territory-settings`, `#route-unit-settings` | 권역·호차 |
| `#business-number-settings`, `#company-closure` | 고급 설정 |
| `#sales-kpi-settings` | 회사 정보(보류 플래그가 켜진 회사만 표시) |

## 운영 확인

실제 직원의 이름을 바꾸고 소셜 재로그인한 뒤 원래 이름으로 되돌리는 검증은 실제 직원 계정의 로그인 조작이 필요해 자동 실행하지 않았다. 코드·단위 테스트·프로덕션 빌드와 배포 상태를 확인한 뒤, 운영 화면에서는 관리자가 해당 직원 이름을 임시 변경하고 직원이 다시 요청/로그인하여 설정·권역·지도·오늘 코스·리드 기록 순서로 확인해야 한다.
