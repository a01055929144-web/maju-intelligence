# CX-120 매장 가격 함수 v2 승인표

검증 기준: 최신 `main` (`1c3de79`). #1125와 SQL 파일이 겹치지 않으며 #1114와는 CI 파일만 공유한다.

## 범위

- 새 함수 `self_order_price_v2(company, customer, product, date, include_promise)`만 추가한다.
- `include_promise=true`: 유효 약속가 → 지정 카탈로그 → 기본가.
- `include_promise=false`: 지정 카탈로그 → 기본가. 연장 편집에서 새로 넣은 품목의 최신가에 사용한다.
- 결과는 `price`, `tax_type`, `includes_tax`, `market`, `source`, `promise_until`을 반환한다.
- 기존 `self_order_price`와 주문 함수는 변경하지 않는다.

## 가격 근거

| `source` | 의미 |
|---|---|
| `promise` | 고객에게 연결된 활성 게시본 중, 요청일이 `validUntil` 이내이고 해당 품목·단위가 있는 가장 최근 게시본 |
| `catalog` | 매장 거래처에 지정된 카탈로그 가격 |
| `base` | `pricing_p0_effective` 기본가 |
| `market` | 시가 품목(금액 없음) |
| `unavailable` | 사용할 수 있는 금액 없음 |

## 영향과 되돌리기

- 테이블·행·기존 함수 변경 없음. 기능 플래그 ON, 운영 적용, 배포를 하지 않는다.
- down은 새 함수만 삭제한다.
- 브라우저 역할에는 실행 권한이 없고 `service_role`만 실행한다. 함수는 빈 `search_path`와 회사·거래처·상품 조건을 사용한다.

## PG17 확인

- 약속 종료일 당일 약속가와 `promise_until` 반환.
- 만료 다음 날 카탈로그 최신가로 복귀.
- 연장 새 게시본 연결 뒤 새 약속가·새 종료일 반환.
- 약속가 제외 모드가 카탈로그→기본가만 사용.
- 지정 카탈로그의 직접 단가가 기본가보다 먼저 선택되고 `source=catalog`인지 확인.
- 과세 약속가의 세금 포함 표시 변환과 `includes_tax`, 면세 기본가의 `tax_type` 경계를 확인.
- 카탈로그 미지정 시 기본가, 시가, 다른 회사 상품 차단, 권한, down 확인.

## 승인 상태

검토 대기. 승인 전 운영 실행 금지.
