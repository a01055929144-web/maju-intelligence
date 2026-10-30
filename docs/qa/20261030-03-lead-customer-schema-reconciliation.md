# 03 리드→거래처 연속성 운영 스키마 대조

> 기준 시각: 2026-10-30 KST  
> 기준 코드: `origin/main@e5e049b`  
> 범위: 읽기 전용 운영 메타데이터 대조. 운영 SQL·migration 적용·데이터 변경 없음.

## 결론

PR #84의 보존·권한 원칙은 유지할 수 있지만, `docs/sql-drafts/20261029-lead-customer-continuity.sql`을 지금 단독 적용하면 안 된다. 선행 `common_revision_history` 초안과 private 보존 객체는 운영에 없고, 운영 DB는 PostgreSQL 17.6이다. 먼저 선행 초안을 별도 승인·migration으로 승격하고, 그 다음 #84 연속성 초안을 PostgreSQL 17에서 검증해야 한다.

이번 리뷰에서는 운영에 아무것도 적용하지 않았다. 리뷰 브랜치의 SQL 변경은 다음 적용 승인을 위한 안전장치와 회사 복합 FK 초안뿐이다.

## 운영 대조 결과

| 항목 | 운영 상태 | #84 가정 | 판정·조치 |
|---|---|---|---|
| PostgreSQL | 17.6 | 로컬 실행 테스트 파일명이 PG16 | 적용 전 PG17 동일 테스트 필수. SQL은 PG15+ 문법을 명시한다. |
| `common_revision_history` | 없음 | 선행 적용 필요 | **차단 조건**. 초안 상단에서 부재 시 즉시 중단한다. |
| `maju_private` / redaction audit | 없음 | #84가 생성 | 예상과 일치. 단, 선행 테이블 적용 뒤에만 생성한다. |
| 거래처 연락 채널 4개 컬럼 | 없음 | #84가 `ADD COLUMN IF NOT EXISTS` | 예상과 일치. `fax`, `instagram_url`, `naver_talktalk_url`, `contact_channels_updated_at` 추가 대상이다. |
| 리드 매칭 컬럼 | 모두 있음 | 기존 컬럼 재사용 | `matched_customer_id/at/method/confidence` 사용 가능하다. |
| C6 권한 컬럼 | 있음 | `permission_role` 우선 | `permission_role`, `membership_expires_at`과 제약이 운영에 있다. 현재 5개 멤버 모두 `permission_role`이 채워져 있고 만료된 active 멤버는 0건이다. |
| 사용자 삭제 경계 | `company_members.user_id ON DELETE SET NULL` | 감사 승인자도 SET NULL | 방향이 일치한다. 승인 당시 역할·사유·시각 스냅샷은 유지한다. |
| 회사 완전 삭제 경계 | lead/customer/member 모두 CASCADE | history/audit도 CASCADE | 방향이 일치한다. 소프트 폐쇄는 행을 유지하고 완전 삭제만 cascade한다. |
| `matched_customer_id` FK | 대상 UUID 단일 FK, 삭제 시 SET NULL | 함수가 회사 일치 확인 | 함수 밖 쓰기까지 막으려면 부족하다. `(company_id, matched_customer_id)` 복합 FK를 추가한다. |
| 공통 장소 기반 | `shared_business_places`와 lead `shared_place_id`는 있음 | A안 `matched_customer_id` 유지 | B안 기반은 일부 적용됐지만 customer에는 `shared_place_id`가 없다. 이번 연결은 계속 `matched_customer_id`를 쓴다. |
| 공개 스키마 기본 권한 | 새 table/function에 anon/auth/service 자동 grant | 초안에서 명시 revoke | 초안의 객체별 revoke를 반드시 유지한다. 기존 전역 기본 권한 변경은 별도 보안 작업이다. |
| RLS | 대상 운영 테이블은 RLS enabled, 정책 없음 | 서버 `service_role` 경로 | anon/auth는 정책 부재로 행 접근이 거부된다. 이번 리뷰에서 기존 권한/RLS는 바꾸지 않는다. |

## 유지해야 할 보안·보존 경계

1. 승인자 UUID를 호출자가 임의로 넣을 수 있으므로 `service_role`에 수동 익명화 함수 실행권한을 주지 않는다.
2. `maju_revision_redaction_operator`는 NOLOGIN·무멤버로 만들고, 서명된 사용자 세션에서 승인자를 추출·검증하는 서버 경계가 승인되기 전에는 어떤 로그인 역할에도 부여하지 않는다.
3. 활성·미만료 멤버의 실권한은 `coalesce(permission_role, legacy role fallback)`으로 판단한다. `role=owner`, `permission_role=staff`는 staff다.
4. 사용자 삭제 시 감사 FK만 NULL로 바뀌고 `approver_role`, `reason_code`, `approved_at`은 남는다.
5. 자동 90일 익명화는 주소와 유선전화만 대상으로 한다. `isMobilePhoneNumber`와 동일하게 010 11자리와 앞자리 0이 빠진 10자리를 휴대폰으로 보고, old/new 중 하나라도 휴대폰이면 전화 변경 행 전체를 보존한다.
6. 조건은 `created_at < p_now - interval '90 days'`다. 즉 정확히 90일인 행은 아직 유지되고 90일을 초과한 시점부터 처리된다. 로컬 fixture에 추가한 90일 경계값을 PG17에서도 다시 실행해야 한다.
7. `service_role`에는 common history의 SELECT/INSERT만 주고 UPDATE/DELETE는 주지 않는다. 익명화 UPDATE는 private `SECURITY DEFINER` 함수로만 수행한다.

## 이번 SQL 초안 보완

- `common_revision_history`와 필수 컬럼이 없으면 변경 전에 실패하는 preflight를 추가했다.
- 운영 대상과 복합 FK 문법에 맞춰 PostgreSQL 15+ 요구를 명시했다.
- 운영에 이미 존재하는 `normalized_customers(company_id, id)` unique를 선행 조건으로 검사한다.
- `business_permit_leads(company_id, matched_customer_id)` 인덱스와 복합 FK를 추가했다.
- 복합 FK는 거래처 삭제 시 `matched_customer_id`만 NULL로 만들고 lead의 `company_id`는 유지한다.
- 운영 읽기 감사에서 현재 매칭 행은 0건이고 교차 회사 매칭도 0건이었다. 적용 시점에는 `VALIDATE CONSTRAINT`가 다시 전체 기존 행을 검사한다.

## 적용 승인 전에 남은 일

1. `20261029-common-revision-history.sql`을 운영용 migration으로 승격할지 별도 승인한다.
2. common history 선행 migration을 PostgreSQL 17 임시 DB에서 실행하고 append-only·회사 cascade·사용자 SET NULL을 재검증한다.
3. #84 연속성 SQL을 별도 migration으로 정리하고, 정확히 90일·90일 초과·010·앞자리 0 누락 10자리·혼합 old/new를 포함한 현재 fixture를 PG17에서 재실행한다.
4. 자동 90일 작업의 실행 주체와 스케줄을 승인한다. 현재 초안은 owner 전용 함수만 정의하며 운영 스케줄은 만들지 않는다.
5. 수동 익명화의 서버 API가 서명된 세션에서 승인자 ID를 결정하기 전까지 operator 역할을 로그인 역할에 grant하지 않는다.
6. migration별 rollback과 test company 1곳의 플래그 활성화 순서를 별도로 승인한다.

## 범위 밖 발견 사항

- 운영의 공개 스키마 기본 권한은 새 table/function을 anon·authenticated·service_role에 자동 grant한다. Supabase의 최신 권고는 새 객체 노출을 opt-in으로 전환하는 방향이다. 이 설정 변경은 전체 API 영향이 크므로 이번 PR에서는 다루지 않는다.
- 대상 테이블은 RLS가 켜져 있지만 정책이 없다. 현재 앱은 자체 서버 세션과 service role을 사용하므로 이번 기능의 직접 차단 요인은 아니지만, 기존 anon/auth broad grant 정리는 별도 보안 PR이 필요하다.
