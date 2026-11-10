# CX-08 행사 수량 예약 — 운영 승인 대기

Ponytail: 사용함. 지시서: `docs/dispatch/2026-11-10-R1-codex.md` CX-08. 운영 쓰기·플래그·배포 없음. 운영 적용은 컨트롤타워가 프로젝트를 지정한 대표 명시 승인 후에만 수행한다.

## 변경 및 영향

기존 두 함수의 행사 수량 집계 조건 한 곳씩만 `so.status = 'submitted'` → `so.status <> 'cancelled'`로 바꾼다. 회사 전체 재고와 매장별 한도에 같은 집계를 사용한다.

| 주문 상태 | 행사 수량에 포함 |
|---|---|
| submitted / received / in_delivery / delivered | 포함 |
| cancelled | 제외 |

행사 행의 `FOR UPDATE`, 회사/매장 격리, 자기 주문 수정 시 기존 수량 제외, 수량 정밀도·가격·멤버 인증·마감·최소금액·주문 상태 수정 제한을 보존한다. 두 함수의 OID·ACL·security invoker를 유지한다. 신규 테이블/컬럼/권한·데이터 백필 없음. 함수 누락/definer/대상 구문 0회 또는 2회 이상/잠금·회사 조건 변경/중복 적용이면 전체 트랜잭션을 중단한다.

## 정확한 원문

| 파일 | git LF 원문 SHA-256 |
|---|---|
| `docs/sql-drafts/20261110-CX-08-promotion-reservation.sql` | `09f01b99a912f6643c691329756b8c11425584ffc8736740c2c9934bfe241532` |
| `docs/sql-drafts/20261110-CX-08-promotion-reservation.down.sql` | `2d276f31f68df38c25210c0f59564f829382e58acd78e8795c437e254d55d821` |

원문은 2026-11-10 main `0f4ef58`의 native 계약에 근거한다. 관련 설정 기본값 초안 및 개업준비 분기는 함수 전체를 복사하지 않고 보존한다. 설정 기본값 up→CX08 up→CX08 down→설정 down의 정의·ACL 완전 복원을 격리 PG17에서 검사한다.

## 운영 읽기 관측 (2026-11-10 KST, 개인정보/행 값 미조회)

운영 기본 격리 수준은 read committed로 읽기 확인했다. 동시성 검증도 이 기존 PostgREST 계약에서 실행한다. 두 함수 모두 invoker, 이전 집계 구문 1회, 행사 행 잠금 존재. anon/authenticated 실행 false, service_role 실행 true. advanced 상태 행사 라인 집계 0건(관측 시점만 유효; 적용 전 재확인).

| 함수 | 적용 전 정의 SHA-256 | 동일 원문의 예상 적용 후 SHA-256 |
|---|---|---|
| place_store_order(7인자) | `f599bd19d1d0e4e3acffce67fea990dcba082a54b00c80b69cff470bed484180` | `3335776d23efb5b48ddb401ef0f39ff007625a6d3687fdf903c6337cb065b73d` |
| place_store_member_order(10인자) | `fdea5cd650b7755024f0e7b4587ad91e92eb96358b098c0b6cd27f5cee83327d` | `2afb5d70db5c49113a3a380e4a212de6c29a0d4b8ba08f1e9655ff32815e0d13` |

아래 읽기 결과가 관측 해시와 다르면 적용하지 말고 전체 정의 diff를 재검토한다. 문자열 guard만으로 승인된 전체 정의 일치를 대신하지 않는다. 원문 예상 후 해시는 같은 원문에서 해당 한 구문을 바꿔 읽기 계산한 값이며 **실제 적용 결과가 아니다**.

```sql
select oid::regprocedure::text signature,prosecdef,proacl,
 encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') definition_sha256,
 pg_get_functiondef(oid) definition
from pg_proc where oid in (
 'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
 'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure);

select so.status,count(*) promotion_lines
from public.store_order_lines sl join public.store_orders so
 on so.company_id=sl.company_id and so.id=sl.order_id
where sl.promotion_id is not null group by so.status;
```

## 승인 후 순서 / 되돌리기

1. 공개 주문·회사 주문 상태 변경을 정지하고 실행 중 주문 RPC가 끝난 것을 확인한다. 운영 플래그 변경은 이 PR에서 하지 않는다.
2. 사전 정의·OID·ACL·invoker·역할 권한·상태별 행사 라인 수를 읽기 기록. 다른 함수 SQL이 동시에 적용되지 않도록 09 단일 작성/적용 순서를 유지한다.
3. 대표 승인된 up을 1회 적용. 3초 lock/10초 statement timeout, 주문 테이블 잠금 안에서 두 정의를 함께 변경한다. 운영 검증용 주문은 만들지 않는다.
4. 사후 정의 SHA-256/전체 diff가 승인된 한 조건 변경뿐인지, OID·ACL·invoker 동일인지와 데이터 건수 불변을 읽기 확인한다.
5. **이 SQL 적용·읽기 검증 → #480(CC-02) 병합/활성화 검토** 순서. SQL 초안/CI 성공은 운영 적용 승인이 아니다.
6. down도 주문/상태 변경 정지 및 RPC drain 후 별도 승인. received/in_delivery/delivered 행사 라인이 한 건이라도 있으면 `cx08_down_refused_advanced_promotion_orders`로 실패한다. 주문 취소/기록 삭제로 강제 우회하지 않는다. 데이터가 생겼으면 전진 수정 또는 별도 복구 승인을 준비한다. 성공 시 두 집계 구문만 이전 상태로 복원하고 OID/ACL/전체 정의 해시를 재확인한다.

## pending-delivery 초안 검사

`20261110-09-pending-delivery-order.sql`은 이미 SUPERSEDED/DO NOT APPLY로 폐기 표시되어 있고 별도 pending RPC만 생성한다. 두 native 함수는 재정의하지 않는다. 런타임에도 pending RPC 호출은 없다. 새 PG17 race 스크립트가 이 두 조건을 정적으로 확인한다. 역사적 격리 CI 자료를 운영에 적용하거나 pending 경로를 되살리지 않는다.

## 격리 검증 / 판정

- 전용 `store_member_order_test_cx08` + loopback + PG17 guard. 기존 실제 P0/P1/P2/S2/멤버 함수 fixture 사용.
- 두 native RPC × 5상태 × 회사 재고/매장별 한도: 취소만 수량 반환. 자기 주문 수정, 소수 수량, 실패 후 부분 주문 없음 검사.
- 서로 다른 매장 링크 두 세션의 실제 행사 행 잠금 대기를 관측. legacy/legacy·member/member·혼합 양방향에서 첫 주문이 received로 확정된 뒤 대기 주문이 재집계해 초과 주문을 거부한다. delivered 기존 주문도 포함.
- up 중복 적용 거부, advanced 상태 down 거부, up/down 정확한 정의·권한 복원, 설정 기본값 SQL 공존 검증.
- 최신 head의 CI 결과·PR 번호는 PR 본문에 기록한다. 결과 전에는 완료/운영 적용으로 판정하지 않는다.

Superpowers/Security Audit 전용 도구 미설치. 직접 권한/회사 경계 검토 및 격리 PG17 검증. 화면/가격/기존 폼·공통 부품 변경 없음.
