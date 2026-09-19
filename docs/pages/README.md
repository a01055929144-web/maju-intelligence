# Page Work Package Index

## PURPOSE

Codex와 Claude가 페이지별 작업 범위를 빠르게 구별하기 위한 제목 인덱스다.

## PRIMARY 8 PACKAGES

| No | File | Page Title | Route Scope | Owner Domain |
| --- | --- | --- | --- | --- |
| 01 | `map-and-route.md` | 지도 홈 OS | `/dashboard`, `/map/fullscreen` | route |
| 02 | `mobile-today.md` | 영업·배송 코스 | `/routes/today`, `/mobile/today` | delivery |
| 03 | `customers.md`, `customers-summary.md` | 거래처 관리·원장 | `/crm/timeline`, `/crm/summary` | customer |
| 04 | `data-registration.md`, `customer-history.md` | 데이터 등록·저장 이력 | `/`, `/customers/data` | customer |
| 05 | `leads.md` | 신규리드·아웃바운드 영업 | `/dashboard` lead tab, `/leads/permits` | lead |
| 06 | `sales-assistant.md`, `reports.md` | AI 영업·리포트 | `/assistant`, `/reports/[id]` | analytics |
| 07 | `settings.md`, `auth.md`, `mobile-join.md` | 회사·직원·로그인 권한 | `/dashboard/settings`, `/dashboard/login`, `/mobile/join`, `/signup`, `/workspaces` | organization |
| 08 | `admin.md` | 플랫폼 관리자 운영 | `/admin/**` | admin |

## USAGE

Use the page title when opening a scoped task.

```text
AGENTS.md, docs/00_PROJECT_RULES.md, docs/pages/map-and-route.md를 읽고
지도 홈 OS 범위만 작업해.
```
