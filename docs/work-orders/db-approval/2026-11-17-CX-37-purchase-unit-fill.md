# CX-37 매입 원문 단위로 빈 상품 단위 채우기 — 승인 대기

상태: **초안 · 운영 미적용**

## 목적

사용자가 채운 단위를 원문 이력에 보관하고, 연결 상품 단위가 비어 있으며 환산이 1:1인 경우에만 같은 트랜잭션에서 상품 단위를 채운다.

## 적용 파일

- docs/sql-drafts/cx-37-fill-blank-unit-from-purchase-receipt.sql

## 안전 경계

- company_id와 product_catalog_id가 모두 같은 상품만 갱신한다.
- 기존 sales_unit 값은 덮어쓰지 않는다.
- purchase_to_sales_ratio가 1이 아닌 포장·환산 상품은 갱신하지 않는다.
- 빈 원문 단위는 무시한다.
- purchase_receipt_lines 저장 트랜잭션 안에서만 실행한다.
- 함수는 security invoker, 빈 search_path, 공개 실행 권한 회수 상태다.

## 사전 확인

1. PG17에서 신규·수정 receipt 행 모두 시험한다.
2. 다른 회사의 동일 상품 ID를 갱신하지 않는지 확인한다.
3. 기존 단위, 환산 비율 1 초과, 빈 단위가 모두 불변인지 확인한다.
4. 날짜 batch 저장 실패 시 상품 단위도 남지 않는지 확인한다.

## 되돌리기

SQL 파일 끝의 Down 절로 trigger와 function만 제거한다. 이미 채워진 단위는 자동으로 비우지 않는다. 값 되돌림은 적용 batch와 감사 근거를 확인해 별도 승인한다.

## 승인

- [x] SQL SHA-256 `37138e67f4997f73e216c1f46425c52d144f0f0d076e55c478f880b7e71c701a`
- [ ] PG17 통과
- [ ] 운영 적용 승인
- [ ] 적용 전·후 대상 건수 기록
