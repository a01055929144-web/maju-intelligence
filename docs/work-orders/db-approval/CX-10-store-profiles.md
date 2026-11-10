# CX-10 매장 프로필·초대코드 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서: `docs/dispatch/2026-11-11-R2-store-signup.md` CX-10, 설계 `docs/design/2026-11-11-store-direct-signup.md` 3절.
**운영 SQL 미실행.** 플래그·배포·기존 데이터 변경 없음. 적용은 대표 명시 승인 문구 후, 아래 순서대로.

## 무엇이 생기나 (`docs/sql-drafts/20261111-CX-10-store-profiles.sql`)

| 대상 | 내용 |
|---|---|
| `store_profiles` (신규) | MAJU 매장 1곳: 매장명, 사업자번호(선택·10자리), 사업자 상태(번호 없으면 `registration_pending`만), 기본주소·상세주소, 상태, 출처(`direct`/`link`/`backfill`), 약관 |
| `store_profile_members` (신규) | 매장 구성원(점주·관리자·직원, `app_users`). 활성 점주 1명, 같은 사용자 활성 중복 금지 |
| `company_store_invite_codes` (신규) | 유통사 초대코드. **원문 저장 안 함 — SHA-256 hex만**, 만료 필수(최대 366일), 회수 시각 |
| `store_accounts` (기존) | `store_profile_id`(nullable) + `invite_code_id`(nullable) 열. `(company_id, store_profile_id)` 유일 — 한 유통사에 같은 매장 한 번. 초대코드는 `(company_id, id)` 복합 FK — 다른 회사 코드로 연결 기록 불가 |
| 함수(service_role 전용, invoker) | `create_store_profile_v1`(프로필+점주), `issue_company_store_invite_code_v1`, `revoke_company_store_invite_code_v1`(자기 회사만·멱등), `resolve_company_store_invite_code_v1`(살아 있는 코드면 회사 ID·코드 ID만 반환, 회사 이름·목록 비노출) |

세 신규 테이블은 RLS 켜짐 + anon/authenticated 권한 없음(서버 service_role만). 영업권 보호(설계 2절): 매장이 유통사 목록을 읽는 함수·뷰는 만들지 않는다. 유통사 쪽 조회는 항상 `company_id`로 거른다.

## 이번에 하지 않는 것

- 코드 입력으로 실제 연결(`store_accounts` 행 생성)과 거래처(`normalized_customers`) `needs_review` 생성 → CX-11/CX-13. `store_accounts.customer_id`가 필수라 거래처 생성 규칙과 함께 정한다.
- 사업자번호를 넣은 직접 가입 프로필은 `active`로 저장하지만 국세청 상태 확인은 하지 않는다(기존 매장 계정의 확인 절차는 연결 시 그대로). 확인 기록 칸이 필요하면 CX-11에서 추가.
- 원가관리 이전(S5).

## 기존 매장 1:1 백필 계획 (`…-backfill.sql`, 별도 승인)

- 운영 읽기(2026-11-11): `store_accounts` **1건**, 활성 매장 구성원 1명, 가입 요청 5건(가입 요청은 백필 대상 아님).
- 각 매장 계정마다 프로필 1개(`origin='backfill'`, 원래 계정 ID 기록)를 만들고 활성 구성원(카카오 사용자 있는 사람)을 같은 역할로 복사, `store_profile_id` 연결. 사업자번호가 같아도 **합치지 않는다**(나중에 검토 후).
- 끝에 `store_profile_id`가 빈 계정이 남으면 전체 중단.
- 되돌리기 `…-backfill.down.sql`: 백필 프로필이 원래 계정 외에 쓰이고 있으면 거부, 아니면 연결 해제 후 백필 프로필·구성원 삭제.

## 적용 순서 (승인 후)

1. 사전 읽기: 위 테이블·열이 없음, `store_accounts`·활성 구성원 건수 기록.
2. up 1회(3초 잠금 대기·30초 제한, 이미 적용이면 `cx10_already_applied`로 중단).
3. 사후 읽기: 테이블·열·제약·인덱스·함수 존재, anon/authenticated 권한 false·service_role true, 기존 `store_accounts` 건수 불변.
4. 백필은 별도 승인 문구 → 적용 → `store_profile_id` 빈 계정 0, 프로필 수 = 매장 계정 수 확인.
5. down: 프로필·코드·연결 기록이 하나라도 있으면 `cx10_down_refused_existing_profiles_or_codes`로 거부(데이터 삭제로 우회하지 않음).

## 격리 검증 (CI PG17, `tests/sql/store-profiles-cx10.pg17.test.sql`)

실제 매장 계정·구성원·회원 주문 함수가 설치된 `store_member_order_test` 체인 마지막에 실행: 권한(anon/authenticated 불가), 직접 가입(번호 있음/개업 예정), 없는 사용자 거부, 점주 2명 거부, 원문·과거 만료 코드 거부, 회수·만료 코드 확인 안 됨, 다른 회사 회수 거부, 다른 회사 코드로 연결 거부, 백필 1:1·구성원 복사, down 거부 → 백필 되돌리기 → down → 재적용·재down.
