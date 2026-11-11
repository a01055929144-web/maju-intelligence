# VB-DB 마주식자재 → 비브 재개 — 운영 적용 완료 (2026-11-11 14:2x KST, 컨트롤타워)

- 승인 문구(대표, 14:26): `fcmdvveqmcgtioelzqun 비브 계정 재개 승인 — 마주식자재 이름 비브, active, 대표 owner, 영업 지역 비우기`
- 대상: `companies` `898d85fc-c475-47e0-9943-91709e13a4bb` (크론 시간 06:00~07:30 밖)

## 사전 확인
- 상태 `closed`(closed_at 2026-11-03), owner 없음, 활성 직원 0, 음식점 리드 4,894, 영업 지역 1(서울 송파구).
- 대표 계정: 제이에스리테일 활성 owner 계정(app_user `5681adcd…`). 로그인 시 작업공간 2개 이상이면 `/workspaces`에서 선택.

## 적용 (한 트랜잭션)
1. `admin_audit_logs` `company_reopened_renamed` — 승인 문구, 변경 전 값(이름·상태·closed_at/by·owner), 지운 영업 지역 행 전체(되돌리기용) 기록.
2. `companies`: `name='비브'`, `status='active'`, `closed_at/closed_by=null`, `owner_user_id=대표`.
3. `company_members`: 대표 owner(`permission_role=owner`, `duties={sales}`, active) 추가.
4. `company_lead_search_regions`: 비브 1행 삭제 → 매일 음식점 자동 수집 대상에서 빠짐.

## 사후 읽기 검증
| 항목 | 결과 |
| --- | --- |
| 이름·상태 | 비브 · active · closed_at null |
| owner | 대표 · 활성 owner 1명 |
| 영업 지역 | 0 |
| 리드 | 4,894 그대로(보존) |
| 대표 작업공간 | 2(제이에스리테일·비브) |
| 감사 로그 | 1건 |

## 되돌리기
감사 로그 `metadata.before`로 `companies` 복원, 비브 owner 멤버 행 `status='inactive'`, `metadata.removed_lead_search_regions` 재삽입.

## 다음
- `DISTRIBUTOR_SALES` 스위치 비브만 ON은 CC-21 배포 때(지금 코드에 없음).
- 대표 확인: 로그인 → 작업공간 선택에 "비브"가 보이는지.
