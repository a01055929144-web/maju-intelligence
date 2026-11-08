# 09 가칭 링크 1건 — 단일 트랜잭션 실행안 / 승인 대기

Ponytail: 사용함

**운영 미승인·미실행.** 영구 함수/스키마/일반 고객 발급 동작은 변경하지 않는다. 기존 API 두 요청을 연속 호출하는 방법은 사용하지 않는다. 이 문서는 승인 후 실행할 1회성 DB 트랜잭션과 격리 PG17 검증안이다.

## 기준과 읽기 결과

- 컨트롤타워 제공 대표 회사 기준: 고객 0, 링크 0, 주문 0, 18품목 견적 게시 버전 1, customer_imports 41, uploaded_files 41.
- 09의 2026-11-08 15:48:20 KST 운영 SELECT 집계: 프로젝트 전체 링크 0, 활성 0, 활성 주문 가능 0, 고객 0, 주문 0. 개인정보/토큰을 조회하지 않았다.
- 기존 issue_storefront_links는 6인자이며 SECURITY INVOKER임을 읽기 확인했다. 운영 함수 변경/고객·링크 생성은 하지 않았다.
- 04가 별도 승인으로 만든 가칭 고객 1건, 같은 회사의 기존 견적 게시 버전·소유자 범위를 읽기로 확정한 후에만 다음 절차의 입력을 만든다. 테스트 이후 import/upload 건수는 04 절차의 실제 변경분과 대조하며 임의 삭제하지 않는다.

## 승인 표

| 대상 | 허용 요청 범위 | 현재 상태 |
|---|---|---|
| 회사/고객/게시 버전 | 실행 시 비공개 확인할 단일 회사·가칭 고객·기존 18품목 게시 버전 | 대상 ID 미확정 |
| 영구 SQL 변경 | 없음. 기존 함수 OID/본문/ACL/기본값 유지 | 적용 없음 |
| 1회성 운영 쓰기 | 기존 발급 + 해당 신규 링크 can_order=false를 한 트랜잭션에서 저장 | 승인 대기·실행 금지 |
| 입력/결과 | 정확히 1건, canOrder:false 명시, 승인된 고정 UUID/nonce/hash/만료시각 | 비밀값·토큰 출력 금지 |
| 열람/회수 | 별도 승인 후 PC390 열람 기록과 해당 링크 회수 | 승인 대기 |
| 고객 정리 | 04 소유, 의존성 검사·별도 승인 | 09 실행 안 함 |
| 발송/수락/주문/플래그/배포 | 금지 | 실행 없음 |

## 실행 클라이언트 계약

1. 기존 서버 서명 helper issueStoreLinkToken으로 신규 링크 UUID에 대한 nonce/hash를 안전한 서버 메모리에서 준비한다. 운영 signing secret/token/전체 URL을 채팅·SQL·로그·문서에 남기지 않는다. 기존 고객용 API create는 호출하지 않는다.
2. 직접 DB 연결 1개에서 BEGIN. statement_timeout/lock_timeout을 거래 범위에 설정한다. TEMP oneoff_readonly_link_input(company_id uuid,document_version_id uuid,links jsonb,expires_at timestamptz,actor_user_id uuid,actor_key text) ON COMMIT DROP을 만들고 한 행을 파라미터 바인딩으로 넣는다. links는 정확히 한 객체(customerId,id,nonce,hash,canOrder:false)다. 기존 서명 비밀은 DB에 보내지 않는다.
3. docs/sql-drafts/20261108-09-oneoff-readonly-link.sql 전체 본문을 같은 연결·같은 트랜잭션에서 실행한다. 기존 발급 함수와 동일한 회사 행 잠금을 먼저 잡아 선행 점검과 발급을 직렬화한다. 기존 활성 주문 가능 링크/다른 ID·서명을 재사용하지 않고 실패한다.
4. 기존 issue_storefront_links 호출 결과를 TEMP 테이블에 보관한다. 같은 트랜잭션에서 해당 회사/고객/게시 버전/링크 ID만 can_order=false로 UPDATE하고 결과 1건·정확한 ID/nonce/hash/만료·주문 중지 상태를 검증한다. 실패 시 연결 클라이언트가 ROLLBACK한다.
5. 결과로 issued_link_id/was_created만 메모리에 읽고 COMMIT 성공 확인 후에만 성공을 보고한다. 중간 조회 결과를 외부에 내보내지 않는다. 커밋 응답 유실이면 재발급하지 말고 같은 ID를 먼저 읽는다. 동일한 고정 입력 재시도는 기존 false 링크를 그대로 재사용하며, 회수 후 재시도는 중단한다.
6. COMMIT 후 기존 권한 있는 GET /api/pricing-store-links?companyId=... 목록에서 정확한 ID를 찾아 URL을 받는다. 이 경로가 기존 서버 secret과 저장된 nonce로 토큰을 복원한다. SQL 결과로 bearer token을 만들거나 외부로 반환하지 않는다. 기존 signer의 복원 hash가 저장 hash와 일치하는지 확인한다. 읽기 권한이 없으면 SQL로 우회해 URL을 출력하지 말고 중단한다.
7. 공개 URL을 열기 전 독립 읽기 연결에서 같은 ID의 can_order=false와 고객/버전을 확인한다. 그 뒤 승인된 열람만 진행한다. 기능이 OFF면 켜지 않고 중단한다. 기존 게시본 변경·새 문서 발행·수락 API 호출·주문 API 호출은 하지 않는다.

MVCC 계약: 신규 can_order=true 행은 커밋 전 발급 트랜잭션 내부에만 잠시 존재한다. 외부 연결에서는 커밋 전 신규 행이 없고, 커밋 후 처음 보이는 상태가 false여야 한다. 발급 후 독립 API로 끄는 방식과 다르다.

## 롤백 / 회수

- 커밋 전 어느 단계든 실패: 같은 연결에서 ROLLBACK. 새 링크·주문 중지 변경·TEMP 결과가 모두 폐기돼야 한다. 기존 함수와 기존 링크는 변경하지 않는다.
- 커밋 후: 롤백이라고 부르며 DELETE하지 않는다. 해당 링크만 기존 revoke API로 회수하고 독립 읽기에서 revoked_at 및 can_order=false를 확인한다. 기존 주소 재조회 404, 주문/발송/수락 증가 0건을 검증한다. 고객 정리는 04 별도 승인 범위다.
- 영구 함수 변경이 없으므로 down migration은 없다. 영구 함수 수정 초안은 별도 로컬 브랜치 codex/09-readonly-link-sql-draft-20261108, 커밋 dc9ee98에 보관했으며 이번 실행안/PR에는 포함하지 않는다.

## 격리 PG17 인수 조건

tests/sql/oneoff-readonly-link.pg17.test.sql은 합성 DB oneoff_readonly_link_test 전용이다. scripts/test-oneoff-readonly-link.mjs는 PGHOST=127.0.0.1, 정확한 테스트 DB명, PG17을 강제하며 실제 템플릿 본문을 실행한다.

- 일반 기존 호출 기본 true 유지, 기존 주문 가능 링크의 잘못된 재사용 거부.
- 외부 연결은 미커밋 신규 행을 볼 수 없음, 커밋 후 false만 관찰.
- 발급 직후/UPDATE 직후 강제 실패 각각 링크 0건으로 롤백.
- 다른 회사 고객 주입 거부, 동일 고정 입력 재시도 같은 링크 1건.
- 커밋 후 기존 서명 helper로 토큰 복원/hash 검증(출력 없음), 회수 후 열람 기록 거부.
- 기존 함수 OID/본문 hash/EXECUTE ACL/SECURITY INVOKER 불변, 주문·이벤트 생성 0건.

검증 결과는 PR의 해당 커밋 CI에서 확인한다. 운영 실행·영구 함수 적용 없음.
