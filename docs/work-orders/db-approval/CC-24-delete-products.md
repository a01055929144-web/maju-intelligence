# CC-24 상품 삭제 함수 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-products-partners.md` CC-24.
**운영 SQL 미실행.** 화면·기능 스위치·배포 변경 없음. 적용은 대표 명시 승인 문구 후.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-24 상품 삭제 SQL 승인`

## 무엇이 바뀌나 (`docs/sql-drafts/20261111-CC-24-delete-products.sql`)
| 대상 | 내용 |
|---|---|
| `cc24_delete_products(회사, 상품 id 목록, 적용 여부)` (새 함수 1개, 테이블·열 변경 없음) | 적용 여부=false면 **숫자만 센다**(확인창용). true면 한 트랜잭션에서 ① 안 쓴 상품은 **완전 삭제**, ② 쓰인 상품은 `is_active=false`(숨김)만. 회사 단위 잠금, 한 번에 500개까지, 다른 회사·없는 id는 무시. `service_role`만 실행 |

- **"쓰였다"의 기준**(운영 FK로 확인, 2026-11-11 읽기): 문서 줄(`business_document_lines`) · 계약 단가(`customer_price_agreements`) · 배송 품목(`delivery_event_items`) · 재고 잔량·문서 위치·이동·실사 줄(`inventory_*` 4개) · 매입 영수증 줄·보정(`purchase_receipt_lines`·`_line_overrides`) · 제안 품목(`sales_offer_items`) · 견적 품목(`sales_quote_items`) · 매장 주문 줄(`store_order_lines`). 이 중 하나라도 가리키면 숨기기만 한다.
- 안 쓴 상품이 지워질 때 함께 사라지는 것: 판매가 행·마진 템플릿 항목·행사·판매가 이력·단위 환산·재고 설정·공급처 기본값·매장 즐겨찾기·공급처 매칭(전부 기존 `ON DELETE CASCADE`, 상품에 딸린 파생 정보). 가격 관측값은 연결만 끊긴다(기존 `SET NULL`).
- 없는 테이블은 건너뛴다(테이블이 없으면 참조도 없음). 운영에는 위 12개 모두 있음.
- 되돌리기(down): 함수만 삭제. **이미 완전 삭제된 상품은 복구되지 않음**(그래서 화면에서 두 숫자를 확인창에 보여준다). 숨긴 상품은 화면의 되살리기로 `is_active`만 켜면 됨.

## 적용 순서 (승인 후)
1. 사전 읽기: 함수 없음, 12개 참조 테이블 존재 확인.
2. up 1회(3초 잠금 대기·30초 제한, 이미 있으면 `cc24_already_applied`로 중단).
3. 사후 읽기: 함수 존재·`anon`/`authenticated` 실행 불가·`service_role` 가능. **데이터 변경 없음**(함수는 화면이 부르기 전까지 아무것도 하지 않음).
4. 이 문서에 결과 기록 → 화면 단계(삭제 버튼·확인창·숨김 목록·되살리기) 진행.

## 격리 검증 (CI PG17, `tests/sql/delete-products-cc24.pg17.test.sql`)
권한(app 역할 불가) · 숫자만 세기(변경 없음) · 적용(안 쓴 것 삭제+딸린 행 사라짐, 쓴 것 숨김, 이력 보존, 다른 회사 불변) · 반복 적용 무해 · 다른 회사 id 무효 · 빈/없음/501개 거부 · down 후 재 up.
