# CX-102 카드 결제 설계

- 상태: 설계 문서. 코드·키·계약·SQL·운영 설정 변경 없음
- 1차 범위: 토스페이먼츠 일반결제의 카드 선결제만. 가상계좌·계좌이체·빌링키 자동결제·카드+계좌 분할결제는 제외
- 안전 장치: 기능 기본 OFF + 회사 허용목록. 운영 계약·키·DB 초안 승인 전 결제창을 열지 않음
- 현재 운영: 후불을 유지하고 고객사 계좌로 직접 입금한다. 카드 결제는 제공하지 않는다.
- 구현 시작 조건: 정식 사업자 준비와 토스페이먼츠 계약 완료 뒤 별도 승인

## 1. 원칙

1. `store_orders`와 `store_order_lines`가 주문·금액의 정본이다. 브라우저가 보낸 `amount`, 상품 가격, 세금은 신뢰하지 않는다.
2. 결제창을 열기 전에 서버가 주문 revision을 잠그고 품목·행사·세금·배송비를 다시 계산해 결제 시도에 스냅샷으로 저장한다.
3. 성공 URL은 결제 완료 증거가 아니다. 저장한 `orderId`·금액과 성공 URL의 `paymentKey`·`orderId`·`amount`를 대조한 뒤 서버가 승인 API를 호출한다.
4. 승인·취소·웹훅은 회사 ID와 주문 ID를 항상 함께 확인한다. 결제 식별자는 대소문자를 바꾸지 않고 원문 그대로 보관한다.
5. 결제 한 건과 승인·부분취소 거래는 분리한다. `paymentKey` 하나에 승인 및 여러 `transactionKey`가 생길 수 있다.
6. 돈의 움직임은 기존 append-only `partner_ledger_entries`에 남긴다. 기존 행을 수정·삭제하지 않고 취소·환불 행을 추가한다.
7. 카드 수수료를 매장에 별도 부과하거나 카드 전용 단가표를 만들지 않는다. 카드 결제에는 세금계산서를 중복 발행하지 않는다.

## 2. 주문 → 결제창 → 승인

| 단계 | 서버 동작 | 허용 상태 |
|---|---|---|
| 1. 결제 준비 | 인증된 매장·회사·주문을 확인하고 주문 행을 잠근다. 동일 주문의 진행 중 결제 시도를 재사용한다. | 주문 `submitted`, 결제 없음/실패/만료 |
| 2. 금액 확정 | 현재 주문 revision의 품목 가격·행사·수량·과세/면세·배송비를 서버에서 재계산한다. 시세 품목처럼 금액이 확정되지 않은 주문은 카드 결제를 막는다. | 결제 시도 `ready` |
| 3. 결제 시도 저장 | 충분히 무작위한 Toss `orderId`, 승인 멱등키, 회사·매장·주문·revision, 과세/면세/배송비/총액, 테스트·라이브 구분과 MID를 먼저 저장한다. | `ready` |
| 4. 결제창 | 서버가 돌려준 `orderId`와 총액으로 클라이언트가 카드 결제창을 연다. 성공/실패 URL은 같은 Origin을 사용한다. | `authenticating` |
| 5. 승인 전 검증 | 성공 URL의 세 값을 결제 시도와 비교하고 주문을 다시 잠근다. 주문 revision 또는 서버 재계산 금액이 달라졌다면 승인하지 않고 새 결제 준비를 요구한다. | `pending_approval` |
| 6. 승인 | 저장해 둔 동일 멱등키로 `POST /v1/payments/confirm`을 호출한다. 응답의 `paymentKey`, `orderId`, MID, 통화, `totalAmount`, 상태를 재검증한다. | `approving` → `paid` |
| 7. 내부 반영 | 승인 거래를 저장하고 카드 입금 원장 행을 한 번만 만든다. 이미 매출전표가 있으면 배분하고, 없으면 주문 귀속 미배분 입금으로 두었다가 전표 확정 때 연결한다. | `paid` |

토스 결제 인증은 승인 전 상태이며 제한 시간 안에 승인해야 한다. 승인 API 시간초과 때 새 `orderId`나 멱등키를 만들지 않고 같은 키로 재시도하거나 `paymentKey`/`orderId` 조회로 결과를 확인한다.

## 3. 상태 모델

내부 상태는 Toss 상태를 그대로 저장하는 칸과 업무 상태를 분리한다.

| 내부 상태 | 뜻 | 다음 상태 |
|---|---|---|
| `ready` | 서버 금액과 주문 revision 저장 완료 | `authenticating`, `expired` |
| `authenticating` | 결제창 진행 중 | `pending_approval`, `failed`, `expired` |
| `pending_approval` | 인증 결과를 받았고 승인 전 검증 대기 | `approving`, `failed`, `mismatch` |
| `approving` | 승인 API 결과 미확정 포함 | `paid`, `failed`, `reconciliation_required` |
| `paid` | Toss `DONE` 확인 및 내부 승인 거래·입금 기록 완료 | `cancel_pending`, `partially_cancelled`, `cancelled` |
| `cancel_pending` | 취소 API 결과 미확정 | `partially_cancelled`, `cancelled`, `reconciliation_required` |
| `partially_cancelled` | 일부 금액 취소 완료 | `cancel_pending`, `cancelled` |
| `cancelled` | 승인 금액 전액 취소 완료 | 종결 |
| `failed` / `expired` / `mismatch` | 결제 실패·인증 만료·금액 불일치 | 새 결제 시도 |
| `reconciliation_required` | Toss와 내부 결과가 불명확하거나 불일치 | 조회·대사 후 허용된 전이만 적용 |

지연·중복 웹훅은 현재 상태를 과거로 되돌리지 않는다. 주문 출고·배송 가능 여부는 결제 시도 존재가 아니라 `paid`와 내부 입금 기록 완료를 함께 확인한다.

## 4. 웹훅

1. 1차 등록 이벤트는 카드 일반결제의 `PAYMENT_STATUS_CHANGED`만 사용한다.
2. `request.json()` 전에 원문 본문을 읽고 `{원문}:{tosspayments-webhook-transmission-time}`의 HMAC SHA-256을 검증한다. `tosspayments-webhook-signature`의 복수 `v1:` 서명 중 하나가 맞아야 한다.
3. `tosspayments-webhook-transmission-id`는 전송마다 달라지므로 업무 멱등키로 쓰지 않는다. `PAYMENT_STATUS_CHANGED`는 `eventId`가 없으므로 `paymentKey`·조회된 상태·거래 `transactionKey`·내부 단방향 전이로 중복을 막는다.
4. 서명 검증 후 정규화한 이벤트, payload hash, 전달 ID, 후속 처리 상태를 내구성 있게 저장한 뒤에만 10초 안에 `200`을 반환한다. 저장 실패면 성공 응답을 보내지 않아 재전송을 받는다.
5. 웹훅 본문만으로 상태를 확정하지 않는다. Toss 결제 조회 API로 `paymentKey`, `orderId`, MID, 금액, 통화, 상태를 다시 확인한 뒤 승인과 같은 상태 전이 함수를 호출한다.
6. 후속 처리 실패는 재처리 대기 상태로 남긴다. 원문·서명·시크릿·카드 정보는 로그와 운영 화면에 노출하지 않는다.

## 5. 전액 취소·부분 취소

1. 환불 권한, 회사·주문 소유권, 결제 `paid` 여부, 환불 가능 잔액, Toss의 `isPartialCancelable`을 서버에서 확인한다.
2. 취소 명령과 충분히 무작위한 멱등키를 DB에 먼저 저장한다. 동일 명령의 모든 네트워크 재시도에는 같은 키를 사용하며 최소 15일 동안 결과를 재사용한다.
3. `POST /v1/payments/{paymentKey}/cancel`에 `cancelReason`을 보내고, 부분 취소일 때만 `cancelAmount`를 보낸다. 금액을 생략하면 전액 취소다.
4. 응답의 각 취소 `transactionKey`, 금액, 상태, 시각을 별도 거래 행으로 저장한다. `paymentKey` 행을 덮어쓰지 않는다.
5. 성공한 취소마다 기존 카드 입금에 대응하는 append-only 환불/반전 원장 행을 정확히 한 번 추가한다. 전표 배분이 있었다면 원배분을 고치지 않고 반대 배분을 추가한다.
6. 누적 취소액이 승인액보다 클 수 없도록 결제 행을 잠근다. 누적액이 승인액과 같으면 `cancelled`, 작으면 `partially_cancelled`다.
7. API 시간초과 또는 상태 불명확 때 새 멱등키로 재취소하지 않는다. 같은 키 재시도와 결제 조회로 수렴시키고, 불일치는 `reconciliation_required`로 격리한다.

카드 부분 취소는 Toss 처리 완료와 카드사 환급 반영 시점이 다를 수 있으므로 고객 문구를 `취소 처리 완료`와 `카드사 반영 대기`로 구분한다.

## 6. 전표·입금 연결

- 카드 승인 성공은 `partner_ledger_entries`의 카드 입금(`receipt`) 1건을 만든다. 멱등키는 승인 거래 식별자와 결제 시도에 고정한다.
- 결제 시점에 매출전표가 아직 없으면 입금은 `store_order`를 source로 가진 미배분 입금이다. 출고 확정으로 매출전표가 생길 때 `business_document_payment_allocations`로 연결한다.
- 전표가 먼저 있으면 승인 거래·입금·전표 배분을 같은 DB 트랜잭션에서 기록한다.
- 부분취소는 환불 원장과 반대 배분을 추가한다. 확정 전표 자체를 조용히 줄이거나 삭제하지 않는다. 반품·누락은 반품전표/조정전표가 정본이고, 카드 환불 또는 선입금 적립 선택은 별도 명령으로 남긴다.
- 결제 승인만으로 매출전표를 확정하거나 재고를 출고하지 않는다. 전표·재고는 기존 출고 확정 흐름이 소유한다.

## 7. 멱등·동시성·대사

- 주문별 진행 중 결제 시도는 하나만 허용한다. 재결제는 이전 시도가 실패·만료·전액 취소된 뒤 새 시도로 만든다.
- `orderId`, `paymentKey`, 승인 `transactionKey`, 취소 `transactionKey`, 승인/취소 명령 멱등키에 고유 제약을 둔다.
- 승인과 취소는 결제·주문 행을 잠그고 금액과 허용 상태를 다시 확인한다.
- 동일 Toss 결과가 성공 URL, 승인 응답, 웹훅, 재처리에서 반복돼도 거래·입금·배분은 한 번만 생성한다.
- 일 단위 대사에서 Toss 승인·취소 거래와 내부 거래·입금·환불 원장을 비교한다. `PG에만 존재`, `내부에만 존재`, `금액 불일치`, `상태 불일치`, `처리 대기`로 분류하고 자동 재승인·재취소하지 않는다.

## 8. 테스트 키 범위

- 개발·미리보기·CI는 카드 일반결제용 테스트 클라이언트 키·테스트 시크릿 키·테스트 MID·테스트 웹훅 보안 키만 사용한다.
- 라이브 시크릿과 라이브 웹훅 키는 Preview/CI에 주입하지 않는다. 테스트와 라이브 MID, 웹훅 URL, 수신 원장을 분리한다.
- 브라우저에는 클라이언트 키만 제공한다. 시크릿 키와 웹훅 보안 키는 서버 전용이며 문서·PR·로그·응답에 값을 남기지 않는다.
- 구독 빌링키용 MID/키와 매장 일반결제용 MID/키를 분리한다. 기존 구독 콜백을 일반결제 웹훅으로 재사용하지 않는다.
- 테스트는 실제 과금 없이 정상 승인, 승인 중복, 금액 변조, 승인 시간초과, 웹훅 서명 실패·중복·순서 역전, 전액/다중 부분취소, 취소 중복, 회사 간 접근, 입금·배분 정확히 한 번을 검증한다.
- 라이브 전환은 별도 계약·카드사 심사·운영 승인·키 검증·대사 리허설 뒤에만 한다.

## 9. 필요한 DB 초안 목록

아래는 후속 SQL 승인 대상 이름과 책임만 정한다. 이 문서에서는 SQL을 만들지 않는다.

1. `store_order_payment_attempts`: 회사·매장·주문·revision, Toss `orderId`/`paymentKey`, 서버 계산 금액 스냅샷, 내부/Toss 상태, 환경·MID, 승인 멱등키, 오류·재처리 상태.
2. `store_order_payment_transactions`: 승인·취소별 `transactionKey`, 유형, 금액, 상태, 발생 시각. 결제 시도와 회사 복합 FK 및 거래키 고유 제약.
3. `store_order_payment_cancellations`: 취소 명령, 요청 금액·이유, 멱등키, 요청자, 처리 결과. 한 결제의 여러 부분취소 지원.
4. `payment_webhook_inbox`: 회사/MID, 전달 ID, 선택적 `eventId`, event type, payload hash, 정규화 payload, 서명 검증 시각, 처리·재시도 상태와 오류. RLS + service role 전용 + 보존 정책.
5. `store_orders` 확장: `payment_mode`에 `card_prepay`, 결제 요구/완료 상태 또는 현재 결제 시도 참조. 기능 OFF 회사에는 기존 `postpay`만 허용.
6. `partner_ledger_entries` 확장: 주문 결제 source(`source_type`, `source_id`)와 카드 승인/환불 유형·멱등 제약. 기존 append-only 원칙 유지.
7. `business_document_payment_allocations`: 기존 초안을 재사용해 카드 입금·환불과 매출/반품전표를 연결. 새 배분 테이블을 만들지 않는다.
8. 원자 함수 초안: 결제 준비, 승인 결과+입금 반영, 웹훅 수신/처리, 취소 명령+환불 반영, 전표 생성 후 미배분 입금 연결. 모두 회사 범위·멱등키·행 잠금을 포함한다.

## 10. 선행·제외

- CX-98은 CX-101·CX-103 뒤에 진행한다. 현재가·단가표·판매가 계산에서는 반품을 제외한다.
- CX-101/103이 확정하기 전 이 문서는 결제 승인 시 전표를 새로 만들지 않는다. 기존 주문·출고·전표 정본을 따른다.
- 카드+계좌 분할, 가상계좌, 현금영수증, 선입금 자동 사용, 라이브 키 등록, 실제 결제·환불은 후속 범위다.

## 11. 공식 근거

- [결제 흐름과 승인 전 금액 검증](https://docs.tosspayments.com/guides/v2/get-started/payment-flow)
- [결제 승인·조회·취소 API](https://docs.tosspayments.com/reference)
- [전액·부분 취소](https://docs.tosspayments.com/guides/v2/cancel-payment)
- [웹훅 서명과 이벤트](https://docs.tosspayments.com/reference/using-api/webhook-events)
- [웹훅 재전송 정책](https://docs.tosspayments.com/guides/v2/webhook)
- [멱등키](https://docs.tosspayments.com/reference/using-api/authorization)
- [테스트·라이브 API 키](https://docs.tosspayments.com/reference/using-api/api-keys)
- [승인·취소·부분취소 거래 개념](https://docs.tosspayments.com/resources/glossary/transaction)
