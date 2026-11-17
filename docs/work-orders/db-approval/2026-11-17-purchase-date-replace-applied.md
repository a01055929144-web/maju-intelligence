# 2026-11-17 운영 DB 적용 — 매입가 날짜별 바꿔 넣기

- 승인 문구 (대표, 11/17 12:57): `fcmdvveqmcgtioelzqun 운영 DB에 2026-11-17-purchase-date-replace.sql 적용 승인 (매입가 날짜별 바꿔 넣기)`
- 적용 파일: `docs/sql-drafts/2026-11-17-purchase-date-replace.sql` (PR #990). 되돌리기 파일 `...down.sql`, PG 테스트 `...pg17.test.sql`도 있습니다. 테스트는 CI PG17과 로컬 PG16에서 통과했습니다.
- 적용: 컨트롤타워가 운영 DB `fcmdvveqmcgtioelzqun`에 한 트랜잭션(`lock_timeout 3s`)으로 적용했습니다. 같은 트랜잭션 안에서 `admin_audit_logs`에 `db_draft_applied` 1행을 남겼습니다.

## 바뀐 것
- `purchase_cost_date_batches_v2`에 컬럼 `replaced_receipt_count`, `replaced_cost_history`와 체크 2개를 추가했습니다.
- 트리거 `purchase_cost_date_batch_replace_v2`를 추가했습니다(BEFORE UPDATE OF status, SECURITY DEFINER, 직접 실행 권한 없음).
  - 배치가 completed로 바뀔 때, 같은 날짜의 예전 업로드 행을 무효 처리하고 같은 날짜의 예전 원가 이력을 보관한 뒤 지웁니다.
  - 배치가 restored로 바뀔 때, 무효 처리한 행을 다시 살리고 보관한 원가 이력을 되돌려 넣습니다.
- 뷰 `purchase_receipt_effective`에 `where r.invalidated_at is null`을 추가했습니다.

## 적용 뒤 읽기 확인
| 항목 | 결과 |
|---|---|
| 새 컬럼 2개 | 있음 |
| 트리거 | 켜짐(O) · SECURITY DEFINER · service_role 직접 실행 불가 |
| 뷰 필터 | 들어감 · service_role select 유지 |
| 매입 행 | 유효 828 = 뷰 828 · 무효 0 (적용만으로는 바뀐 행 없음) |
| 감사 기록 | 1행 |
| 11/1~17 재업로드 미리보기 | 11/05 실제 전표 83행 → 바뀜 대상 · 11/04(10월 월합계) 745행 → 그대로 |

되돌릴 때: 업로드 화면의 [되돌리기]는 가장 최근 배치부터 돌립니다. 스키마까지 되돌릴 때는 `...down.sql`을 씁니다. 이때 무효 처리된 행과 보관한 원가 이력을 먼저 되살립니다.
