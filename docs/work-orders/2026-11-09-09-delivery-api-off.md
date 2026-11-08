# 09 배송지 주문·완료 API OFF 준비

Ponytail: 사용함

Owner: order(09). Related: delivery(02 서버 검증/소비자), organization(07 기존 세션 재사용), ledger(03 후속). API에서 SQL을 재구현하지 않고 기존 주문 PUT과 #410 wrapper를 재사용한다. 02/03/07/04 소유 파일·운영 환경변수·DB·배포 변경 없음.

## 준비된 경로

- 기존 PUT /api/storefront: STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED=true 및 STORE_ORDER_DELIVERY_COMPANY_IDS의 정확한 회사 일치일 때만 #410 place_store_order_with_delivery_snapshot_09를 호출한다. 기본 OFF이며 기존 7/10인자 RPC 경로는 그대로다.
- 추가 입력 deliverySnapshot은 #410의 5개 camelCase 필드만 받는다. 이름/기본 주소 필수, 선택 값 빈 문자열은 null이다. SQL이 최초 등록 거래처/주소·기존 snapshot·멱등 키를 최종 검증한다. 재시도는 같은 입력 snapshot/key를 유지해야 하므로 API가 매번 최신 고객 마스터 값으로 덮어쓰지 않는다.
- 회원·회사 문맥은 기존 signed link/회원 검증을 사용하며 클라이언트 식별자·가격은 전달하지 않는다. wrapper 실패 시 기존 RPC로 fallback하지 않는다. 결과는 기존 {result:{id,revision,knownTotal,marketPricePending}}다.
- POST /api/store-orders/delivery-completion: STORE_ORDER_DELIVERY_COMPLETION_ENABLED 기본 OFF에서 404이며 세션/본문/DB 접근 없음. ON이어도 같은 origin·기존 세션 확인 후 503 delivery_completion_verification_unavailable로 **모든 호출을 차단**한다. 일반 직원 세션을 기사/코스 인증으로 간주하지 않는다. 완료 RPC·메모/첨부 저장·전표 호출 없음.

## 02와 합의·구현하기 전 완료 호출 차단

02 #405는 순수 명령 생성 계약이다. 클라이언트 DTO만으로 서버 권한·배정·증빙이 검증됐다고 판단하지 않는다. 실제 검증 연결은 아직 없으며 합의 완료로 보고하지 않는다.

| 02/09 연결 책임 | 호출 전 필수 조건 |
| --- | --- |
| 02 서버의 기사/코스 검증 | 인증 기사 세션 → 확정 코스·차량·정류장·거래처·배송일·정확한 주문 묶음 검증. 동일 이벤트 재시도마다 다시 검증 |
| 02 증빙 권한, 09 원자적 저장 계약 | noteId/attachmentIds의 회사·거래처 소유 검증 및 완료와 같은 DB 트랜잭션 연결. 현재 #410 SQL에는 증빙 연결 입력이 없어 API 단독 연쇄 호출로 대체 금지 |
| 09 명령 변환 | 서버 검증 company/customer/actor만 사용. UUID 확인. #410 completionEventId가 유일한 멱등 키이므로 #405 별도 idempotencyKey 관계 확정 |
| 09 결과/이력 | expected revision과 completed revision 의미 및 #405 DTO 변환, 영속 이벤트↔주문 관계·고정 completed_at 기반 명시적 이력 projection |
| 03 후속 | delivered 단일 상태·동일 영속 완료 관계 확인 후 주문 ID source key 전표 1개. 반품/void는 별도 계약 |

## SQL 승인 순서와 실제 첫 주문 전 차단점

1. 기존 P0/P1/P2/S2 및 회원 10인자 RPC 적용 상태 확인. #410은 기존 7/10인자 함수를 교체하지 않는다.
2. 02 배송지 DDL 별도 승인·적용: docs/work-orders/db-approval/store-order-delivery-snapshot-02.md. 5개 칸·불변 trigger를 먼저 확인한다.
3. #410 head 9d0dc72의 up/down·권한·개인정보 보존·회사 삭제 경로 검토 및 별도 운영 SQL 승인. CI #2496 PG17 PASS는 운영 적용 승인이 아니다. SQL을 API PR에 복사하지 않는다.
4. 이 API 변경의 CI·리뷰 후 별도 병합/배포 판단. 플래그와 회사 허용 목록은 계속 OFF/빈 값.
5. 실제 첫 snapshot 주문 전 기존 화면에서 5개 snapshot을 최초 제출·편집·동일 키 재시도에 고정해 보내는 연결과 브라우저→API→격리 PG17 검증이 필요하다. 이번 API 준비는 화면을 변경하지 않았으므로 누락 입력은 400으로 차단된다. 기존 주문을 자동 backfill하지 않는다.
6. 회원 로그인/활성 계정·거래처 배송 설정/주소·가격·대표 회사 검증 범위 확인 후 별도 첫 주문 승인. 실제 주문·배정·고객 데이터는 만들지 않았다.
7. 완료는 위 02 인증/증빙 원자 계약 및 이력·상태/지연 시각 정책 승인 전에는 ON해도 503 차단을 유지한다. SQL 승인만으로 Stage D/E 완료를 선언하지 않는다.
