# 02 주문 ID → 배송 완료·이력 DB 승인 경계

> 상태: **승인 전 · 실행 SQL 없음 · 운영 실행 금지**  
> 소유: 02는 소비자 요구만 정의한다. store_orders 상태·완료 RPC와 그 SQL은 09 주문 도메인이 생산한다. 중앙 db-approval-queue.md는 컨트롤타워만 수정한다.

## 결론

02의 주문 후보 묶기와 기존 코스 결합은 읽기 전용 Application 로직이므로 새 SQL이 필요 없다. 다만 기사 완료 후 주문 ID와 증빙을 영구 연결하고 이력에서 재조회하려면 09 완료 Use Case의 승인된 저장 계약이 선행돼야 한다.

## 승인 필요 여부

| 요구 | 02 SQL | 필요한 생산자 승인 |
| --- | --- | --- |
| 배송 대상 주문 후보 조회 | 없음 | 09가 회사·배송일 범위의 읽기 DTO/API 확정 |
| 매장 1정류장 + orderIds 묶기 | 없음 | 없음 |
| 기존 수동 코스 유지 | 없음 | 없음 |
| 주문별 delivered 전환 | 작성 금지 | 09 mark_delivered RPC/Use Case |
| 완료 증빙과 주문 ID 연결 | 작성 금지 | 09가 저장 위치와 복합 FK 확정 |
| 완료 재시도 멱등 | 작성 금지 | 09가 회사별 멱등 제약 또는 동등 계약 제공 |
| 주문 ID 포함 배송 이력 조회 | 없음이 원칙 | 위 저장 계약을 읽는 09 projection/API |

## 02가 요구하는 최소 완료 계약

아래는 09 RPC의 이름이나 테이블 설계가 아니라 02 소비자가 잃지 않고 전달·재조회해야 하는 최소 의미다. 기존 `customer_notes`는 그대로 두며 완료 판정의 정본으로 사용하지 않는다.

~~~ts
type OrderDeliveryCompletionCommand = {
  companyId: string;
  customerId: string;
  deliveryDate: string;
  completionEventId: string;
  idempotencyKey: string;
  completedAt: string;
  orders: Array<{ orderId: string; orderRevision: number }>;
  proof: { noteId?: string; attachmentIds: string[] };
};

type OrderDeliveryCompletionResult = {
  completionEventId: string;
  completedAt: string;
  orders: Array<{ orderId: string; orderRevision: number }>;
};
~~~

- `orders`는 비어 있거나 중복되면 거부한다.
- 서버는 회사·거래처·배송일과 각 주문의 현재 revision을 다시 검증한다.
- 결과에는 실제로 완료 전환된 정확한 주문 집합을 반환한다.
- 이력 조회는 `completionEventId`와 위 주문 집합을 그대로 반환한다. 메모 문구나 거래처 단위 완료 여부로 복원하지 않는다.
- 사진·메시지 공유 성공 여부와 주문 완료 저장 성공 여부를 섞지 않는다. 주문 완료는 증빙 참조와 함께 원자적으로 저장한다.

## 부분 완료 필수 사례

같은 거래처·배송일의 후보가 `order-A`, `order-B` 두 건이어도 기사가 `order-A`만 전달했다면 요청과 결과의 `orders`에는 `order-A`만 들어간다.

| 확인 대상 | 기대 결과 |
| --- | --- |
| `order-A` | `delivered`, 완료 이벤트·증빙에서 조회 가능 |
| `order-B` | 기존 상태 유지, 같은 완료 이벤트에 연결되지 않음 |
| 오늘 코스 | 거래처 정류장은 유지하고 `order-B`를 남은 배송 대상으로 표시 |
| 배송 이력 | 해당 이벤트에는 `order-A`만 표시 |
| 같은 멱등 키 재시도 | 같은 `order-A` 결과 반환 |
| 같은 멱등 키로 `order-A`, `order-B` 재요청 | 입력 충돌로 거부 |

부분 완료를 위해 별도 부분완료 상태나 신규 코스 테이블은 만들지 않는다. 주문별 기존 상태와 완료 이벤트의 명시적 주문 집합만 사용한다.

## 승인표 초안

| 승인 항목 | 최소 결정 | 소유 | 현재 상태 |
| --- | --- | --- | --- |
| 완료 명령 | 위 필드의 의미와 주문 집합 검증 | 09 | 승인 대기 |
| 주문 상태 전환 | 요청에 포함된 유효 주문만 `delivered` | 09 | 승인 대기 |
| 동시 수정 방지 | `orderRevision` 불일치 시 전체 거부 | 09 | 승인 대기 |
| 멱등 | 같은 키·같은 입력은 같은 결과, 다른 입력은 충돌 | 09 | 승인 대기 |
| 증빙 연결 | 기존 note/attachment 참조 재사용, 주문과 같은 transaction | 09 | 승인 대기 |
| 완료 projection | 이벤트 ID·완료시각·정확한 주문 ID/revision 반환 | 09 생산, 02 소비 | 승인 대기 |
| 코스 잔여 표시 | 완료되지 않은 형제 주문만 남은 대상으로 유지 | 02 | 생산자 승인 후 연결 |
| 운영 적용 | SQL 적용·기능 플래그 ON·운영 데이터 검증 | 운영 승인 | 금지 |

## 09 승인안에 반드시 포함할 조건

- 인증된 company_id와 주문의 회사가 일치한다.
- 입력 주문이 같은 거래처·배송일 묶음인지 서버에서 다시 확인한다.
- 취소·수정·이미 완료된 주문의 처리 결과를 명시한다.
- 같은 멱등 키와 같은 입력은 같은 결과를 반환한다.
- 같은 멱등 키에 다른 주문 ID 집합은 충돌로 거부한다.
- 복수 주문 중 일부만 요청한 경우 요청에 없는 형제 주문의 상태와 이력을 변경하지 않는다.
- 증빙은 기존 customer note/attachment를 재사용하되 메모 문자열 파싱으로 주문 ID를 복원하지 않는다.
- 주문 상태와 증빙 연결은 한 트랜잭션에서 성공하거나 모두 실패한다.
- 다른 회사 주문·증빙 참조는 복합 FK 또는 RPC 검증으로 거부한다.
- down, PG17 회사 격리·재시도·취소·복수 주문 테스트가 포함된다.
- 기능 플래그 기본 OFF, 운영 적용과 플래그 ON은 별도 승인이다.

## 02가 만들지 않는 것

- 별도 주문 정본
- 주문 상태 복제 테이블
- 주문별 코스 엔진
- route_plan_confirmations의 주문 ID 컬럼
- customer note 메모에 주문 ID를 붙이는 임시 방식

## 차단

09 생산자 PR과 DB 승인 문서가 병합되기 전에는 02 코드·SQL·플래그를 만들거나 운영에 연결하지 않는다. 단계 A/B/C 완료 판정 전에는 대표 회사 시험과 단계 D 완료 표시도 하지 않는다.
