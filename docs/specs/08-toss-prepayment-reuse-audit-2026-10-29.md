# 09 P4 매장 선결제 대비 Toss 연동 재사용 조사

- 작성일: 2026-10-29
- 기준 커밋: `f0385c3`
- 담당 범위: 08 플랫폼 관리자 조사 메모
- 상태: 설계 입력용. 결제 코드, 요금제, SQL, 운영 설정은 변경하지 않는다.

## 1. 결론

기존 구독 자동결제 연동의 공통 HTTP 래퍼와 결제 식별자 모델 일부는 재사용할 수 있다. 다만 현재 구현은 `billingKey` 기반 월 자동청구에 맞춰져 있으며, 09 P4 매장 선결제에 필요한 일반결제 상태 동기화, 웹훅 검증, 취소·환불, 테스트/라이브 키의 강제 분리는 구현되어 있지 않다.

따라서 P4에서 `lib/toss-payments.ts`를 그대로 확장하기 전에 아래 경계를 먼저 분리해야 한다.

1. 공통 전송 계층: Basic 인증, JSON 처리, 타임아웃, 오류 정규화
2. 구독 결제 어댑터: 빌링키 발급·청구·삭제
3. 선결제 어댑터: 승인 조회·취소·환불
4. 웹훅 어댑터: 원문 본문 서명 검증, 중복 방지, 결제 조회 교차 확인
5. 환경 설정: 용도별 MID/키 세트와 테스트·라이브 환경 검증

## 2. 현재 재사용 가능한 부분

| 항목 | 현재 위치 | 재사용 판단 | 주의사항 |
| --- | --- | --- | --- |
| Toss API 기본 주소와 Basic 인증 | `lib/toss-payments.ts` | 공통 전송 계층으로 추출 가능 | 서버 시크릿만 사용하고 인증 헤더를 로그에 남기지 않아야 한다. |
| 요청 타임아웃·오류 응답 정규화 | `tossRequest()` | 재사용 가능 | 결제 승인, 조회, 취소별 타임아웃과 재시도 정책은 분리해야 한다. |
| 안전한 `orderId` 생성 | `generateTossKey()` | 선결제 주문 식별자 후보 | DB 고유 제약과 함께 사용해야 하며 주문 생성 재시도 때 새 ID를 남발하면 안 된다. |
| `paymentKey`, `orderId`, 금액, 상태 저장 | `subscription_payments` 흐름 | 필드 개념만 재사용 가능 | 구독 결제 원장과 매장 선결제 원장은 분리한다. |
| 회사·권한 경계 | `getRequestAuthScope`, `manage_billing` | 인증 패턴 재사용 가능 | 매장 선결제의 결제·환불 권한은 별도 capability로 정의할지 먼저 결정한다. |

`app/api/billing/callback/route.ts`는 카드 등록 위젯의 브라우저 리다이렉트 콜백이다. Toss 서버가 보내는 웹훅이 아니므로 웹훅 수신·서명 검증 경로로 재사용하면 안 된다.

## 3. 웹훅 서명 검증 보완점

현재 저장소에는 Toss 웹훅 엔드포인트와 `tosspayments-webhook-signature` 검증 코드가 없다. P4 구현 전 다음 요구사항을 충족해야 한다.

1. `request.json()`보다 먼저 원문 본문을 읽고 보존한다.
2. `{원문 본문}:{tosspayments-webhook-transmission-time}`를 Toss 개발자센터에서 발급한 웹훅 보안 키로 HMAC SHA-256 처리한다.
3. `tosspayments-webhook-signature`의 모든 `v1:` 값을 파싱하고 Base64 디코딩한 뒤 하나라도 일치하는지 상수 시간 비교한다. 키 교체 중 복수 서명이 올 수 있다.
4. 서명 실패 요청은 상태 변경 없이 거부한다. 본문이나 서명, 보안 키를 로그에 남기지 않는다.
5. `tosspayments-webhook-transmission-id`를 고유키로 저장해 재전송을 멱등 처리한다.
6. 10초 안에 `200`을 반환할 수 있도록 수신과 후속 처리를 분리한다. Toss는 실패 시 최대 7회 재전송한다.
7. 서명 성공만으로 결제를 확정하지 않는다. 결제 조회 API로 `paymentKey`, `orderId`, `totalAmount`, `mId`, `status`를 내부 주문과 교차 확인한 뒤 상태를 전이한다.
8. 수신 시간 허용 범위와 오래된 요청 거부 기준은 구현 명세에서 확정한다. 전송 ID 중복 방지는 반드시 유지한다.

권장 이벤트 후보는 `PAYMENT_STATUS_CHANGED`와 `CANCEL_STATUS_CHANGED`다. 실제 등록 이벤트는 P4 결제수단과 상태 머신 확정 후 최소 범위로 선택한다.

## 4. 취소·환불 보완점

현재 `updateSubscriptionStatus(..., "canceled")`는 다음 자동청구를 중단할 뿐 이미 승인된 결제를 환불하지 않는다. `deleteBillingKey()`도 결제 취소 API가 아니다. P4 환불에 이 둘을 사용하면 안 된다.

선결제 환불은 서버에서 `POST /v1/payments/{paymentKey}/cancel`을 호출하는 별도 유스케이스가 필요하다.

- 필수: `cancelReason`
- 부분 취소: `cancelAmount`
- 중복 방지: 충분히 무작위한 `Idempotency-Key`
- 사전 검증: 회사 범위, 주문 소유권, 환불 권한, 현재 승인액, 기존 취소 합계, `isPartialCancelable`
- 성공 기록: `transactionKey`, `cancelAmount`, `cancelReason`, `cancelStatus`, `canceledAt`, 남은 환불 가능액
- 사후 동기화: API 응답과 `CANCEL_STATUS_CHANGED` 웹훅을 동일 상태 머신으로 수렴

환불 요청이 시간초과되더라도 새 멱등키로 즉시 재요청하지 않는다. 같은 멱등키로 결과를 재확인하고, 필요하면 결제 조회로 실제 취소 상태를 확인한다. 부분 취소·면세·가상계좌 환불계좌는 P4 결제수단 범위가 확정된 뒤 별도 정책으로 제한한다.

## 5. 테스트 키와 라이브 키 분리

현재 설정은 `NEXT_PUBLIC_TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY` 한 쌍이며, 값이 존재하는지만 확인한다. 다음 위험이 남아 있다.

- 테스트 클라이언트 키와 라이브 시크릿 키를 섞어도 애플리케이션이 시작 단계에서 감지하지 못한다.
- 구독 자동결제 MID와 선결제 MID가 다를 경우 한 쌍의 환경변수로 용도를 구분할 수 없다.
- 서버 전용 조회·환불도 현재 `isTossPaymentsConfigured()` 때문에 클라이언트 키 존재 여부에 종속된다.

P4 구현 시 권장 원칙:

1. 개발·미리보기 환경에는 테스트 키만, 운영 환경에는 라이브 키만 주입한다.
2. 클라이언트 키와 시크릿 키가 같은 환경·같은 MID 세트인지 배포 전 검증한다.
3. 구독과 선결제가 다른 MID라면 환경변수 이름과 설정 객체도 용도별로 분리한다.
4. 서버 준비 상태와 브라우저 SDK 준비 상태를 별도로 판단한다. 조회·환불·웹훅 검증은 공개 클라이언트 키에 의존하지 않는다.
5. 시크릿 키와 웹훅 보안 키는 서버 전용 시크릿 저장소에 두고 `NEXT_PUBLIC_` 변수, 응답 본문, 로그, PR, 문서에 넣지 않는다.
6. 키 접두사와 배포 환경이 맞지 않으면 결제를 비활성화하고 배포 검증을 실패시킨다. 실제 키 문자열은 오류 메시지에 포함하지 않는다.
7. 키 회전 시 결제 승인·조회·취소·웹훅을 모두 점검한 뒤 기존 키를 폐기한다.

환경변수의 구체적인 이름과 MID 구성은 Toss 계약 범위가 확정된 뒤 결정한다. 이 메모에서는 운영 설정을 추가하거나 변경하지 않는다.

## 6. P4 착수 전 최소 체크리스트

- [ ] 선결제 결제수단, 전액/부분 환불, 면세 여부 확정
- [ ] 구독 MID와 선결제 MID의 분리 여부 확인
- [ ] 테스트·미리보기·운영 키 세트의 배포 범위 확정
- [ ] 주문·결제·취소·웹훅 전송 ID의 고유 제약 및 상태 머신 설계
- [ ] 웹훅 원문 서명 검증과 복수 `v1` 서명 테스트 벡터 준비
- [ ] 웹훅 중복·순서 역전·지연·재전송 테스트
- [ ] 결제 조회 교차 검증 실패 시 격리·재처리 정책
- [ ] 환불 권한, 감사 로그, 멱등키 보존 기간 정의
- [ ] 실제 결제를 발생시키지 않는 테스트 키 기반 통합 테스트
- [ ] SQL 별도 승인 전 코드에서 신규 테이블을 참조하지 않기

## 7. 공식 문서 근거

- 웹훅 이벤트와 서명 검증: https://docs.tosspayments.com/reference/using-api/webhook-events
- 웹훅 등록·재전송 정책: https://docs.tosspayments.com/guides/v2/webhook
- 보안 체크리스트: https://docs.tosspayments.com/reference/using-api/security-checklist
- 결제 취소 가이드: https://docs.tosspayments.com/guides/v2/cancel-payment
- 결제 취소 API: https://docs.tosspayments.com/reference
- 인증·멱등키: https://docs.tosspayments.com/reference/using-api/authorization
- 테스트·라이브 API 키: https://docs.tosspayments.com/reference/using-api/api-keys

## 8. 이번 작업에서 하지 않은 것

- 결제·환불·웹훅 코드 추가 또는 수정
- 요금제 기능 및 가격 값 변경
- SQL·Supabase·운영 데이터 변경
- Vercel 환경변수 또는 Toss 개발자센터 설정 변경
- 실제 API 호출과 실제 결제·환불 실행
- 키 값 조회·출력·복사
