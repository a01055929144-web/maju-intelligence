# Stage D 배송 완료 운영 적용 승인 패킷 (02)

> 상태: **승인 전·실행 금지**  
> 소유: 02 배차/배송 소비자 경계  
> 금지: 운영 DB 쓰기, `STAGE_D_ORDER_COMPLETION` ON, Draft 해제, 모바일 버튼 연결

이 문서는 02 snapshot/guard와 09 완료 저장 계약을 운영에 올리기 전 하나의 승인 단위로 검토하기 위한 실행 순서이다. 이 PR은 실행하지 않는다.

## 1. 고정 입력

| 구분 | 고정 대상 | 상태 |
| --- | --- | --- |
| 02 snapshot/guard | `docs/sql-drafts/20261108-stage-d-delivery-snapshot-02.sql` | 미적용 |
| 02 snapshot down | `docs/sql-drafts/20261108-stage-d-delivery-snapshot-02.down.sql` | 미실행 |
| 09 주문·완료 SQL | #410 head `220b9c1011368570873f61be467e651cf22a6cec` | Draft·미적용 |
| 02 API | #414 head `dee7158653efede215e9445724b4f9ea2606c4fe` | Draft·기능 OFF |
| 폐기형 통합 검증 | Stage D CI `42505701088` | PASS |
| 전체 회귀 | Linux CI `42505701176` | PASS |

승인 시점에 head가 달라졌다면 diff와 PG17/PostgREST 통합 CI를 다시 실행한다. 상기 SHA를 관성적으로 최신 branch로 대체하지 않는다.

## 2. 적용 순서

1. 쓰기 유입을 막고 최신 백업·복구 시간·적용 담당자를 기록한다.
2. `STAGE_D_ORDER_COMPLETION` 기본 OFF와 회사 allowlist 빈 값을 확인한다.
3. 02 snapshot/guard up을 먼저 적용한다.
4. 02 snapshot 컬럼 5개, 부분 snapshot 거부 제약, 불변 trigger, 회사·배송일 후보 index를 확인한다.
5. snapshot 없는 기존 주문이 자동 backfill되지 않았고 `missing_delivery_snapshot` 차단 대상으로 남았는지 확인한다.
6. #410 09 up SQL을 적용한다. 02 선행 없이 09를 먼저 실행하지 않는다.
7. 아래 09 객체·RLS·권한 검사를 모두 통과한다.
8. #414 애플리케이션을 **기능 OFF**로 배포한다. 엔드포인트는 404여야 한다.
9. 관찰 기간 동안 기존 주문·배송·가격·PC/390px 회귀와 DB 오류율을 확인한다.
10. 운영 책임자가 시험 회사·기사·거래처·주문 1건·시험 시간을 서면 승인한 후에만 1건 시험을 별도 변경으로 진행한다.

## 3. 객체·RLS·권한 확인표

| 대상 | 필수 확인 |
| --- | --- |
| `store_orders` snapshot 컬럼 5개 | `text`, 기존 행 `null` 유지, 부분 snapshot 금지 |
| `store_orders_delivery_snapshot_immutable_02` | 활성 trigger, 저장 후 수정 거부 |
| `store_order_delivery_requests_09` | RLS ON, service role SELECT/INSERT만, UPDATE/DELETE 없음 |
| `store_order_delivery_completions_09` | RLS ON, 회사+이벤트 PK, 거래처·메모 복합 FK |
| `store_order_delivery_completion_orders_09` | RLS ON, 이벤트·주문 FK, 주문당 단일 완료, post=pre+1 |
| `store_order_delivery_completion_attachments_09` | RLS ON, 회사·거래처·첨부 FK, 완료 후 삭제/소유권 이동 차단 |
| `complete_store_order_delivery_09(...)` | security invoker, anon/authenticated EXECUTE 없음, service role만 EXECUTE |
| 모든 신규 테이블 | public/anon/authenticated 직접 SELECT/INSERT/UPDATE/DELETE 없음 |
| 회사 경계 | 다른 회사의 주문·메모·사진 조합 거부 |

위 항목은 폐기형 PG17의 정상 결과와 운영 catalog 조회 결과가 동일해야 한다. 일치하지 않으면 기능 OFF를 유지하고 시험을 취소한다.

## 4. OFF 배포 후 1건 시험 승인표

시험은 자동화 테스트가 아니라 운영 승인자가 지정한 하나의 실재 배송을 대상으로 한다. OFF 배포 자체는 시험 실행 권한이 아니다. 시험 전 별도 ON 승인이 필요하다.

| 전제 | 통과 기준 |
| --- | --- |
| 주문 | 시험 회사·거래처·배송일이 하나이고 snapshot 필수 2개가 존재 |
| 기사 | 로그인 회사, 배송 업무, 확정 코스, 정류장, 차량 배정 일치 |
| 증빙 | 같은 회사·거래처의 delivery 메모 1개와 delivery_proof 사진 1개 이상 |
| 완료 | 이벤트 1개, 요청 주문 연결 N개, 사진 연결 M개, 주문 `delivered`, revision +1 |
| 재시도 | 같은 event/time/pre revision/proof로 같은 결과, 이벤트·연결 추가 없음 |
| 충돌 | 같은 event에 다른 note/사진 집합은 409, 기존 결과 불변 |
| 이력 | 거래처·기사·차량·주문·증빙을 동일 event로 조회 가능 |

시험 후 계수·event ID·order ID·pre/post revision·note ID·attachment ID·HTTP 결과를 승인 기록에 남긴다. 메모 본문·사진 URL·연락처는 승인 문서에 복사하지 않는다.

## 5. 즉시 중단 조건

다음 중 하나라도 발생하면 allowlist를 비우고 기능 OFF를 확인한 후 추가 시험을 금지한다.

- 다른 회사/거래처의 주문·메모·사진이 결합됨
- 사진/메시지 없이 주문만 `delivered`로 변경됨
- 동일 재시도가 이벤트나 revision을 추가로 만듦
- 서로 다른 증빙의 같은 event 요청이 409가 아닌 성공으로 처리됨
- 일부 주문/증빙만 저장된 원자성 위반
- 완료 시각·order ID·pre/post revision·증빙 조회 결과가 응답과 다름
- 새 API 5xx 증가, 기존 주문/배송/가격 회귀, PC/390px 회귀

## 6. 되돌리기 규칙

| 시점 | 허용된 조치 | 금지/주의 |
| --- | --- | --- |
| SQL 적용 전 | 배포 취소 | DB 조치 없음 |
| 02 snapshot up 후, 09 up 전 | 02 down 전 신규 snapshot 쓰기 0건·적용 대상 SHA 일치 확인 | 새 snapshot 데이터가 있으면 임의 제거 금지 |
| 09 up 후, 완료 event 0건 | 09 승인 down → 02 down 역순으로만 검토 | 02를 먼저 내리지 않음 |
| 완료 event 1건 이상 | 기능 OFF, 애플리케이션 이전 버전 복귀, DB forward-fix | 09 down은 데이터가 있으면 자체 거부하며 TRUNCATE/수동 삭제 금지 |
| 회사 경계/원자성 위반 | 기능 OFF, 쓰기 차단, 사고 범위 보존, 복구 책임자 승인 후 forward-fix | 자동 재시도·자동 정리 금지 |

이전 애플리케이션으로 복귀해도 DB에 이미 생성된 완료 기록은 유지한다. 완료 event가 존재하는 상태에서 down을 강제하지 않는다.

## 7. 승인 체크박스

- [ ] 02 snapshot/guard SQL SHA·PG17 결과 확인
- [ ] #410 고정 head·up/down·PG17 결과 확인
- [ ] 객체·RLS·ACL catalog 검사 첨부
- [ ] 백업·복구 시간·적용/복구 담당자 기록
- [ ] #414 OFF 배포 후 endpoint 404·기존 회귀 확인
- [ ] 1건 시험 대상·시간·승인자 별도 승인
- [ ] 중단 조건·연락체계·forward-fix 담당자 확인
- [ ] 모든 항목 통과 전까지 기능 OFF

