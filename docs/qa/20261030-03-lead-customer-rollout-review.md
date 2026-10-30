# 03 리드→거래처 연속성 적용 판단 한 페이지

> 상태: 설계·검증 준비 약 90%, 운영 적용 0%  
> 기준: `main@75e7c2a`, PR #97, PostgreSQL 17 CI 통과  
> 금지: 이 문서는 운영 적용 승인서가 아니다. 두 SQL은 여전히 review-only 초안이다.

## 결론과 적용 순서

두 초안은 순서를 바꾸거나 한 번에 적용하지 않는다.

1. 기능 플래그를 모두 `false`로 유지하고 실행 주체·백업·중단 기준을 승인한다.
2. `20261029-common-revision-history.sql`을 **첫 번째 migration**으로 별도 승격한다.
3. 빈 이력 테이블, 회사/사용자 FK, 민감값 guard, RLS, `service_role`의 SELECT/INSERT 전용 권한을 검증한다.
4. `20261029-lead-customer-continuity.sql`을 **두 번째 migration**으로 별도 승격한다. 선행 테이블/필수 컬럼이 없으면 preflight가 변경 전에 중단한다.
5. 복합 FK validation, private 객체 권한, PG17 fixture를 다시 통과시킨 뒤 test company 한 곳만 단계적으로 활성화한다.

## 기존 데이터 영향

| 단계 | 기존 행 변경 | 잠금·실패 가능성 | 판단 |
|---|---|---|---|
| 공통 수정 기록 | 기존 lead/customer backfill 없음. 빈 append-only 테이블과 함수·trigger·index를 만든다. | DDL 잠금과 index 생성 시간이 발생한다. 기존 앱 데이터 값은 바꾸지 않는다. | 트래픽 낮은 창과 statement/lock timeout 승인 필요 |
| 연락 채널 확장 | customer에 nullable 4개 컬럼을 추가한다. 기존 행은 모두 `NULL`이다. | 짧은 테이블 DDL 잠금 가능 | 값 backfill 없음 |
| 회사 복합 FK | lead의 기존 `matched_customer_id`를 다시 검사한다. | 교차 회사 또는 없는 customer 연결이 있으면 `VALIDATE CONSTRAINT`에서 전체 transaction 중단 | 적용 직전 읽기 전용 사전 집계 필수 |
| 보존 상태 | history에 nullable redaction 상태를 추가하고 제약을 교체한다. | 기존 history가 생긴 뒤라면 제약 검사가 실패할 수 있음 | 첫·둘째 migration 사이 쓰기 연결 금지 |
| 전환 RPC | 호출 전까지 데이터 변경 없음. 호출 시 customer 빈 칸만 채우고 lead 매칭·상태를 갱신한다. | 잘못된 회사/lead/customer/플래그는 transaction 실패 | 기존 customer 비어 있지 않은 값은 보존 |
| 익명화 | 실행 전까지 변경 없음. 실행하면 phone/address 원문을 redacted 표식으로 대체한다. | 원문 복구 불가 | 별도 승인·감사·실행 주체 확정 전 실행 금지 |

운영 읽기 감사 당시 매칭된 lead는 0건이었지만, 적용 시점에 다시 집계해야 한다. `NOT VALID`로 FK를 추가한 뒤 같은 transaction에서 validation이 실패하면 전체 변경은 rollback된다.

## Rollback 원칙

1. 먼저 기능 플래그와 자동 작업을 끄고 operator 실행권을 회수한다.
2. 두 번째 migration의 view → RPC/function → private audit/function → 복합 FK/index → 신규 customer 컬럼 순으로 의존성을 확인해 되돌린다.
3. customer 컬럼이나 audit/history에 데이터가 한 건이라도 있으면 자동 `DROP`하지 않는다. export·보존·삭제 승인을 별도로 받는다.
4. 첫 번째 migration은 이력이 비어 있을 때만 table/function/trigger/index 제거를 검토한다. 이력이 있으면 읽기 전용 보존이 기본이며 자동 rollback 대상이 아니다.
5. 이미 익명화된 `old_value`/`new_value` 원문은 rollback으로 복구할 수 없다. 백업 복원은 개인정보 재생성에 해당하므로 별도 법무·보안 승인 없이는 수행하지 않는다.

즉 schema rollback과 개인정보 원문 복원은 같은 작업이 아니다. migration에는 실행 전후 row count, 객체 권한, FK 위반 수를 기록하고 각 단계의 forward-fix 절차를 포함해야 한다.

## Operator 인증 경계

- `service_role`에는 수동 익명화 함수 실행권을 주지 않는다. 함수가 승인자 UUID를 받으므로 일반 서버 호출 경로에 노출하면 다른 owner/manager를 가장할 수 있다.
- `maju_revision_redaction_operator`는 `NOLOGIN`·무멤버여야 한다. 초안은 기존 동명 역할이 LOGIN이거나 멤버가 있으면 중단한다.
- 승인된 서버 경계가 서명된 사용자 세션에서 회사·사용자·실권한·만료를 다시 확인하고, 승인자 UUID를 클라이언트 입력이 아닌 서버 세션에서 결정하기 전에는 어떤 로그인 역할에도 operator를 부여하지 않는다.
- 권한 강등은 `permission_role`을 우선한다. legacy `role=owner`여도 `permission_role=staff`면 실행할 수 없다.
- 매장 본인 요청은 `reason_code=store_self_request`와 휴대폰 포함 범위가 반드시 함께 설정되어야 한다.

## 승인 체크포인트

- [ ] 두 migration의 개별 승격·적용 창·timeout·rollback 승인
- [ ] 적용 직전 교차 회사 FK 위반 0건 재확인
- [ ] 90일 자동 작업 주체·주기·실패 알림 승인
- [ ] 수동 익명화 서버 인증 설계와 operator membership 승인
- [ ] 개인정보 원문 보존·삭제·복구 금지 정책 승인
- [ ] test company 활성화와 관찰 기간 후 확대 승인

승인 전에도 유지 가능한 상태는 기능 플래그 OFF, operator 무멤버, 자동 스케줄 없음, 운영 데이터 변경 없음이다.
