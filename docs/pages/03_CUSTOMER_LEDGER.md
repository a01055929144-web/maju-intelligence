> **DEPRECATED — 2026-09-11.** 이 파일은 더 이상 사용하지 않습니다. `docs/pages/customers.md`(거래처 원장) + `docs/pages/customers-summary.md`(전체현황)를 대신 보세요. 이 파일은 삭제 예정이며 사용자가 직접 지울 때까지만 남아있습니다.

# 03. 거래처 관리·원장 | Customer Ledger

## PAGE TITLE

거래처 관리·원장

## STATUS

ACTIVE

## LAST VERIFIED

2026-09-11

## BUILD

PASS at last known deployment cycle. Recheck after every change.

## CURRENT VERSION

Customer ledger package v1

## STATUS SUMMARY

거래처 관리, 거래처 상세, 원장, 첨부, 메모, 히스토리를 담당한다.

## GOAL

거래처 정보를 한 곳에서 보고 수정하고, 첨부/메모/매출/배송 이력이 실제 데이터로 이어지게 한다.

## OWNER DOMAIN

customer

## RELATED DOMAINS

sales, delivery, route, analytics

## PRIMARY ROUTES

- `/crm/timeline`
- `/crm/summary`

## ALLOWED FILES

- `app/crm/timeline/page.tsx`
- `app/crm/summary/page.tsx`
- `components/churn-risk-alert.tsx`
- `components/customer-workspace-tabs.tsx`
- `components/loading-position-gallery.tsx`
- `app/api/customers/*`
- `app/api/customer-operations/*`
- `app/api/customer-attachments/*`

## DO NOT TOUCH

- `app/admin/**`
- `app/api/auth/**`
- `components/permit-leads-view.tsx` unless lead conversion is in scope
- `supabase/**` unless schema change is explicitly requested

## PRESERVE

- Existing customer list/search
- Existing customer detail editing
- Existing attachments
- Existing sales transaction links
- Existing notes/history

## COMPLETED

- [x] 거래처 목록/상세 화면
- [x] 첨부자료 기본 연결
- [x] 메모/히스토리 저장 흐름
- [x] 거래처 전체 현황 화면

## TODO

- [ ] 상세 카드 겹침/잘림 전수 점검
- [ ] 리드에서 거래처 전환 시 필드 누락 방지
- [ ] 첨부파일 종류별 누락 경고 강화
- [ ] 중복 거래처 병합 UX 안정화
- [ ] 거래처와 지도 마커 데이터 일치 검증

## Data Flow

| Source | Used For |
| --- | --- |
| normalized_customers | 거래처 기본정보 |
| customer_notes | 메모/히스토리 |
| customer_attachments | 첨부파일 |
| sales_transactions | 매출/거래 이력 |
| business status fields | 사업자 상태 |

## UX RULES

- 상세 정보는 카드가 겹치지 않도록 auto-fit 레이아웃을 우선한다.
- 중요한 액션은 상단 고정 또는 상세 패널 내 명확한 버튼으로 둔다.
- 설명은 줄이고 상태값과 누락값을 먼저 보여준다.

## VERIFICATION

- 거래처 목록 검색/필터
- 상세 열기/수정
- 첨부 열람/업로드
- 메모 저장
- 매출/방문 이력 연결
