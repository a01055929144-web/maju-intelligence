# E2 매입 전표 → 매입가 기록 승인표

상태: **초안 · 운영 미적용**(대표 승인 문구 전 적용 금지). Owner: pricing. Related: purchase(ERP 전표).
파일: `docs/sql-drafts/20261113-e2-purchase-document-cost.sql` · `.down.sql` · `.pg17.test.sql`(CI PG17 단계 추가).

## 운영 DB 읽기 확인 (2026-11-13, `fcmdvveqmcgtioelzqun`, `pg_get_functiondef`)
- `confirm_business_document`: 저장소 `20261016190000`과 본문 동일(공백·`security invoker` 표기만 다름). 수정하지 않는다.
- `save_purchase_cost_date_batch_v2`: 저장소 `20261107163553`과 허용 키·삽입 열·예외 이름 일치, 차이 없음. 수정하지 않는다.
- `purchase_receipt_lines` 운영 828행. 제약: `dedupe` 유니크(회사, dedupe_key), 배치 FK(on delete cascade), 배치+행번호 부분 유니크. 새 열 4개는 전부 기본값 있음 → 기존 행 변경 없음.
- 주의: 매입 전표 줄에는 `product_catalog_id`가 없고 `supplier_product_id`·`product_code_snapshot`만 있다(검증 트리거가 매입 줄의 상품 참조를 막음).

## 변경 내용
| 항목 | 내용 |
| --- | --- |
| 열 추가 | `source`('upload' 기본 | 'purchase_document'), `business_document_id`(FK 회사+전표), `invalidated_at`·`invalidated_reason`('cancel'|'revise') + 체크 3개 + 인덱스 1개 |
| 기록 시점 | 매입(`purchase`) 전표 draft→confirmed, 정정(revision 증가). AFTER 트리거 `record_purchase_document_costs`(기존 RPC 본문 무변경) |
| 무효 표시 | 취소·정정 시 해당 전표의 유효 줄에 `invalidated_at` 기록(삭제 안 함). 정정은 무효 후 새 줄 기록 |
| 줄→상품 | 줄의 매입처 상품(확정·자동 매칭) > 같은 매입처 상품 코드. 후보가 정확히 1개일 때만. 아니면 기록 안 함 |
| 단위·단가 | 전표 줄 단위 = 상품 매입 단위일 때만. 단가는 부가세 제외 공급가 단가(`unit_price`), 0 이하 제외 |
| 목록 | view `purchase_document_cost_pending_v`: 상품 연결 필요 / 단위 다름 / 단가 이상 |
| 현재가·재계산 | 유효 최신 행(날짜→기록시각→id, CX-06)으로 `product_catalog.purchase_price(+날짜)` 갱신, 바뀌면 `pricing_p0_command(recalculate)` 1회. 날짜 없는 구 현재가는 덮지 않음(업로드와 동일) |
| 권한 | 함수·view 모두 public/anon/authenticated 회수, service_role만 |

## 대표 확인 필요
1. 취소·정정으로 현재가의 근거 행이 모두 무효가 되면 현재가를 **그대로 둠**(0으로 되돌리지 않음). 맞는지.
2. 단위가 다르면 건너뛰고 목록에만 남김(환산 안 함 — 11/12 결정). 매입 단위가 비어 있는 상품도 "단위 다름"으로 분류.
3. 기존 읽기 코드(`app/api/price-sheets/receipts/route.ts`, CX-06 변동률)가 `invalidated_at is null`만 보도록 하는 코드 PR이 필요 — 적용 전에 먼저 병합하거나 같이(컬럼 없을 때 깨지지 않게 적용 후 병합이 안전).
4. 적용 시 기존 확정 전표는 소급 기록하지 않음(트리거는 이후 확정부터). 소급 필요 여부.

## 적용 절차(승인 후, 승인 받은 쪽이 직접)
승인 문구 원문 → 같은 트랜잭션에 `db_migration_applied` audit log → 적용 → 읽기 검증(새 열 4개·트리거·view 존재, 기존 828행 `source='upload'`) → 이 문서에 기록. down 은 전표 출처 행 삭제를 포함하므로 건수 기록 후 사용.

## PG17 검증 항목(CI)
판매 전표 무시 · 확정 시 연결·단위 맞는 줄만 기록 · 공급가 단가 · 현재가+재계산 호출 · 대기 목록 2종 · 정정 시 무효+재기록(행 보존) · 취소 시 무효·현재가 유지 · 출처 체크 제약 · down 왕복.
