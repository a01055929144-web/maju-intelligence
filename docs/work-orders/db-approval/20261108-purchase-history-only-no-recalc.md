# 과거 매입 이력 전용 저장 재계산 차단 승인표

상태: **승인 대기 · 운영 미적용 · 기능 OFF**

## 범위

- SQL 초안: `docs/sql-drafts/20261108-purchase-history-only-no-recalc.sql`
- 대상 함수: `public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)`
- 변경: 현재 매입가 적용 대상이 0개인 이력 전용 batch에서는 `pricing_p0_command(...recalculate)`를 호출하지 않습니다.
- 유지: 원본 매입 이력, batch 행 수, 이력 전용 품목 수, 원자 저장·복구 계약은 그대로입니다.
- 기존 데이터 변경, backfill, 테이블·칼럼·권한 변경은 없습니다.

## 적용 전 승인 조건

1. SQL diff와 대상 함수 정의를 검토합니다.
2. 운영 함수가 `20261107 purchase_cost_date_v2` 적용본과 일치하는지 읽기 전용으로 확인합니다.
3. DB 적용과 회사별 `FEATURE_PURCHASE_HISTORY_ONLY_DEFAULT_COMPANY_IDS` 활성화는 각각 별도 승인합니다.

## 검증

- PG17 브라우저→API→RPC: 날짜 열 없는 3,417행, 화면 적용일 `2026-11-01`, 미연결 4품목 28행 제외, 이력 3,389행 저장.
- 상이 단가 188그룹의 원문 행을 모두 보존하고 현재 매입가·판매가·문서 재계산 0건을 확인합니다.
- batch는 `product_snapshots={}`, `supplier_snapshots={}`, `recalc_run_id=null`, `history_only_product_count=741`이어야 합니다.
- 현재 가격 변경을 명시한 기존 경로는 재계산과 복구가 계속 동작해야 합니다.

## 되돌리기

기능 플래그를 먼저 OFF로 유지한 뒤 `docs/sql-drafts/20261107-purchase-cost-date-v2.sql`의 승인된 함수 원문으로 대상 함수만 복원합니다. 데이터 행은 삭제하거나 수정하지 않습니다. 복원 후 이력 전용 시험과 현재가 변경·복구 시험을 다시 실행합니다.
