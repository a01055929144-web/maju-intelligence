# 09 회사 주문 설정 기본값 — 운영 승인 대기

현재 상태: SQL 초안/격리 PG17만 검증. 운영 실행·플래그 ON·배포 승인 아님. 적용은 컨트롤타워가 별도 승인된 정확한 원문으로만 수행한다.

## 변경 범위

권역과 가능 요일은 필요하지만 회사 `store_order_settings` 행은 주문의 추가 필수조건이 아니다. 기존 조회의 기본값과 native 함수의 거절이 달랐다. 기존 두 함수의 `if not found then raise exception 'Order settings missing'; end if;` 한 구간만 기본값 대입으로 교체한다.

| 항목 | 범위 |
|---|---|
| 함수 | `place_store_order(text,date,jsonb,uuid,uuid,integer,text)` / `place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)` |
| 기본값 | 마감 1일 전 22:00 / 최소금액 0 / notice / 배송비 0 |
| 유지 | 고객→권역→회사 우선순위, 실제 요일·휴일·마감, 멤버 인증/회사 격리, idempotency·주문·가격·정산·snapshot 계약 |
| 변경하지 않음 | 신규 함수/테이블/컬럼/권한/설정 행/권역/요일 생성, 기존 데이터 백필 |
| 보안 | security invoker·OID·ACL 유지, 익명/인증 사용자 권한 확대 없음 |
| guard | 함수 누락/definer/대상 구간 0회 또는 2회 이상/이미 적용이면 트랜잭션 중단 |

## 정확한 원문과 의존성

기준 앱 base `e6ef5ed5118c709d17d03482cc78417e52275ece`, 초안 도입 commit `1eaec4f`. 아래 SHA-256은 **git 원문 LF bytes**이며 운영 함수 해시로 대신 사용할 수 없다.

| 원문 | SHA-256 |
|---|---|
| `docs/sql-drafts/20261110-09-order-settings-defaults.sql` | `507c4375da99882bb3b8c1e544ffd98ce26b3d9a37215a314acb398c3efd1b0b` |
| `docs/sql-drafts/20261110-09-order-settings-defaults.down.sql` | `260f30b8c2afd8b398f27833c7a7ca2cf1f8acaa00238a2c415f4b92263fb0cc` |
| `supabase/migrations/20261102114602_pricing_p2_store_ordering.sql` | `a6fec7d78b7a6395780bda10640579498bec6775f9654346f107229324945722` |
| `supabase/migrations/20261108141800_store_member_order.sql` | `0563ddb19722858079e341bbadf7b1e7920df6e75cdab84a73d08c12497804c9` |

두 기존 native 함수 및 주변 P0/P1/P2/S2/멤버 주문 계약이 전제다. 07 개업준비 분기 등 운영 함수의 후속 변경은 보존되어야 한다. 부분 문자열 guard만으로 전체 운영 정의 일치를 증명하지 않으므로, 컨트롤타워가 아래 읽기 사전검증으로 실제 함수 원문·SHA-256·ACL을 보관하고 승인된 diff와 대조한 뒤 적용해야 한다. 운영 함수 해시는 이 채팅에서 임의 추정하지 않는다.

```sql
select oid::regprocedure as signature, prosecdef, proacl,
 encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') as definition_sha256,
 pg_get_functiondef(oid) as definition
from pg_proc
where oid in (
 'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
 'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure
);
```

## 적용·되돌리기 순서

1. 적용 전: 09 새 검증 OFF 유지, 함수 원문·SHA-256·OID·ACL/보안 보관. 실제 운영 함수가 예상한 대상 구간을 정확히 1개 가지는지와 후속 07 분기 보존을 확인한다. 테이블 건수 및 회사 설정 행 수를 읽기 기록한다.
2. 별도 프로젝트 지정 운영 SQL 승인 후 up을 1회 적용. 함수 변경은 한 트랜잭션이며 새 데이터 쓰기 없음.
3. 사후: 같은 읽기 쿼리로 승인된 기본값 구간 외 diff 0, OID·invoker·ACL 동일, 데이터 건수 불변 확인. 운영 실주문을 검증용으로 만들지 않는다.
4. 07 #463 주소 저장/관련 flags, 기존 public-owner-delivery/allowlist, 기존 고객 권역 연결 확인 후 09 검증 회사별 ON은 별도 결정.
5. 되돌리기: 앱/09 검증 OFF 후 `.down.sql`로 기본값 대입만 원래 거절로 복원. 기록 삭제 없음. 기존 함수에 후속 수정이 있으면 원문 대조 후 진행하며 guard 실패를 우회하지 않는다. 설정 없는 회사는 복원 뒤 원래대로 native 주문이 거절된다.

## 검증

`tests/sql/order-settings-defaults-09.pg17.test.sql`: 폐기 가능한 `store_member_order_test` PG17만 허용. 설정 행 없는 상태에서 기존 7인자/멤버 10인자 RPC 성공·금액/배송비 유지·설정 행 0건, 불가 요일/요일 없음/위조 회원 차단, down 후 두 함수 정의 해시와 ACL 원복을 확인한다. 기존 전체 native/회사 격리/producer/PC390 CI도 함께 통과해야 한다. 최신 결과는 PR #464에 기록한다.

## 공개 주문을 켜기 전 필수 순서

OFF 호환 경로에는 새 주소 검증이 없다. 따라서 대상 회사의 기존 공개 주문/자동 개통이 이미 ON인 상태에서 새 검증을 나중에 켜는 순서는 허용하지 않는다. 운영 점검은 컨트롤타워가 읽기만 수행하고, 플래그 변경은 별도 승인으로 한다.

1. 해당 회사의 공개 주문·자동 개통을 OFF로 유지했는지 확인. 관련 주문·수락 경로와 회사 allowlist를 함께 점검한다.
2. #460의 `needs_review`/`lead_customer_mismatch` 선행 SQL 적용·검증 상태 확인. 기존 거래처가 다른 수락은 orderEnabled=false이고 가격/공개 주문 개통 전 보류되어야 한다. 과거 주문 가능 불일치 링크의 읽기 집계와 별도 처리 승인 없이 우회하지 않는다.
3. #463 분리주소 SQL/저장 계약과 이 승인표의 기본값 SQL 의존성 확인. 서버 기본주소 null이면 기존 합본에서 추정하지 않는다. 기본주소 변경 시 새 위치와 기존 `delivery_territory_id`의 불일치를 읽기 점검하고, 03 담당자가 명시적으로 연결하기 전까지 차단한다. 상세주소만 바뀌었다고 위치 판정을 바꾸지 않는다.
4. **09 주소 검증 플래그 및 회사 allowlist를 먼저 확인**하고, 해당 회사의 검증이 실제 ON임을 확인한 다음에만 기존 public-owner-delivery/자동 개통·공개 주문을 순차 활성화한다. 이 단계까지 공개 주문/개통 OFF 유지. 기존 고객 주문은 주소·권역 링크·요일 준비 여부를 읽기 점검한다.
5. 대표 실제 화면 확인 후 확장 여부 결정. 이번 PR은 어떤 운영 플래그도 변경하지 않는다.

회귀: 저장 주소가 권역 A→B로 변경된 뒤 기존 링크 A가 남으면 공통 판정은 `territory_link_required`로 실패하며 고객 원장을 자동 수정하지 않는다.
