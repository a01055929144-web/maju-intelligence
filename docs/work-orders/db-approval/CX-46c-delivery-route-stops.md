# CX-46c 기사 경로 정류장 SQL 승인 대기

상태: SQL 초안·down·폐기형 PostgreSQL 17 검증만 작성. 운영 실행, 앱 연결, 기능 활성화, 배포 승인이 아니다.

## 범위

- `delivery_route_stops`: 날짜·기사·차량·순서, 배송/영업 종류, 거래처/리드 중 정확히 하나, 진행 상태, 도착·완료 시각/좌표, 주문·매출 전표, 사유 코드.
- `delivery_route_stop_photos`: 정류장당 최대 5장과 선택적인 주문·매출 전표 연결.
- `delivery_route_reason_codes`: 일부 배송, 문제, 전달 못 함의 고정 코드와 D-3 0절의 리드 상태 효과/재방문 표시.
- 기존 `driver_message_templates`를 기사별 서버 저장 수정본으로 재사용한다. 같은 목적의 새 테이블은 만들지 않는다.
- 기존 `route_plan_confirmations.customer_ids`는 삭제·수정하지 않는다. 최초 적용 때 배열 순서를 보존해 배송 정류장으로 복사하므로 이전 화면은 계속 동작한다.
- 기사 경로의 주 키는 이름이 아니라 `driver_member_id`다. 이름은 화면 표시와 레거시 복사본에만 남긴다. 순서 유일 제약은 지연 검사하여 두 정류장 순서를 한 트랜잭션에서 맞바꿀 수 있다.

운영 적용 직후에도 CX-46a가 정류장 쓰기를 연결하기 전까지 `delivery_route_stops`는 비어 있다. 현재 운영 `route_plan_confirmations`가 0행이므로 레거시 복사도 0행이며, CX-46a 전에는 새 테이블을 읽는 화면이나 쓰는 API가 없다.

## 운영 읽기 선행 조건 (2026-11-16 KST)

| 항목 | 확인값 |
| --- | ---: |
| `route_plan_confirmations` | 0행 |
| `company_message_templates` | 15행 |
| `driver_message_templates` | 0행 |
| `delivery_route_stops` | 미적용(테이블 없음) |

## 회사 경계와 권한

- 거래처, 리드, 기사 구성원, 차량, 주문, 전표, 정류장 사진 연결은 모두 `(company_id, id)` 복합 외래 키로 다른 회사 참조를 거부한다.
- 새 세 테이블은 RLS를 켜고 `public`, `anon`, `authenticated`에 권한을 주지 않는다. 검증된 서버 경로만 `service_role`로 읽고 쓰며 API에서 세션 회사 범위를 강제한다.
- 사진 저장 경로는 공개 URL이 아닌 비공개 Storage 경로만 저장한다.

## 적용 전 확인

1. `customer_ids`가 JSON 배열이며 각 값이 같은 회사의 거래처인지 사전 검사가 통과해야 한다. 하나라도 잘못되면 전체 적용을 중단한다.
2. 운영 읽기에서 `route_plan_confirmations` 0행을 다시 확인한다.
3. up/down/PG17 원문의 SHA-256과 대표의 명시 승인 문구를 남긴다.
4. 대표 승인 전 운영 DB에 실행하지 않는다. 앱 코드와 CX-46a·b·e는 별도 PR로 진행한다.

## 되돌리기

레거시 배열에서 복사된 미처리 정류장만 있을 때만 down을 허용한다. 수동/영업 정류장, 상태 변경, 도착·완료 기록, 사진이 하나라도 있으면 증거 보존을 위해 거부한다.

대표 승인: 대기.
