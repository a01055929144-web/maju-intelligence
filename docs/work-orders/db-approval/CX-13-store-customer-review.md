# CX-13 첫 거래 매장 거래처 확인 — 컨트롤타워 검토 대기

Ponytail: 사용함 (Claude Code ponytail-review). 결정: 대표 11/12 "C · G1 · 1차는 후보 제시 + 새 거래처로 확인 + 기존 거래처에 연결(새 거래처에 주문·계약 단가·링크 0건일 때만, 빈 새 거래처는 보관), 일반 병합 함수는 2차" — 근거 [결정 문서](../../design/2026-11-12-cx13-first-trade-decision.md).
**운영 SQL 미실행. 상태: 컨트롤타워 검토 대기** → 검토 후 승인 문구 안내. 화면(CC-08)·API는 승인 뒤. 선행: CX-10·CX-12 운영 적용 완료(11/12).
요청 문구(안): `fcmdvveqmcgtioelzqun CX-13 첫 거래 거래처 확인 SQL 승인`

## 무엇이 바뀌나 (`docs/sql-drafts/20261112-CX-13-store-customer-review.sql`)
| 대상 | 내용 |
|---|---|
| `store_accounts` 열 3개 | `customer_review_status`(`needs_review`·`confirmed`, **기존 행 전부 `confirmed`** = 링크 가입 매장 동작 변화 없음) · `customer_confirmed_by_user_id` · `customer_confirmed_at` |
| `store_customer_review_events` (새 테이블) | 확인·연결 이력(`confirmed_new`·`linked_existing`, 이전/이후 거래처 id, 처리자). RLS 켬, service_role만 |
| `connect_store_profile_by_invite_code_v1` (CX-12, 한 줄 치환 2곳) | 코드로 새로 만들어지는 매장 계정은 `needs_review`로 시작. 앵커가 각 1번 맞아야 하고 식별자·권한·invoker 유지 확인(운영에서 각 1번·invoker·service_role 권한 읽기로 확인함) |
| 트리거 `store_orders_review_guard` | **G1을 DB에서**: `needs_review` 매장 계정의 주문은 `submitted`에서 `received`·`in_delivery`·`delivered`로 못 넘어감(`store_customer_review_required`). 취소는 가능, 링크 주문(`store_account_id` 없음)·확인된 계정은 그대로. 주문함 [확인] PATCH와 이후 배송·전표 단계가 상태를 바꿀 때 모두 막힘 |
| `store_customer_confirmed(회사, 거래처)` | 그 거래처에 미확인 매장 계정이 없는지(배송·전표처럼 거래처 기준으로 일하는 코드용) |
| `confirm_store_customer_v1(회사, 매장계정, 처리자, 이름)` | "새 거래처로 확인". 이미 확인이면 `alreadyConfirmed`, 없는 계정·다른 회사는 `store_account_not_found` |
| `store_customer_review_candidates_v1(회사, 매장계정)` | 읽기 전용 후보 최대 10개: ① 프로필 사업자번호 = 거래처 사업자번호 ② 같은 이름(공백·기호·대소문자 무시) + 주소 앞 10자. **자동 병합 없음.** 이미 매장 계정이 있는 거래처·중복(`duplicate_of`)·자기 자신·다른 회사는 제외 |
| `link_store_account_to_customer_v1(회사, 매장계정, 기존거래처, 처리자, 이름)` | "기존 거래처에 연결". 조건: 계정이 `needs_review` · 지금 거래처가 코드 연결이 만든 것(`normalized_key 'profile:…'`) · 그 거래처를 가리키는 **주문·계약 단가·공개 링크·문서·전표·배송 등 13개 표가 0건** · 대상 거래처에 매장 계정이 없음(`store_accounts (회사, 거래처)`가 유일) · 같은 회사. 성공하면 계정이 기존 거래처를 가리키고 `confirmed`, **빈 새 거래처는 지우지 않고 `duplicate_of`로 기존 거래처를 가리켜 표시**, 이력 기록 |
- 일반 거래처 병합 함수(매출·주문·링크 이동)는 **2차**. 데이터 변경 없음(운영 매장 계정 0개, 기본값 `confirmed`).
- **"보관"의 실제 모양**: 거래처 테이블에 보관 열이 없어 `duplicate_of`(기존 열)로 표시하고 이력에 남긴다. **거래처 목록이 `duplicate_of`를 아직 숨기지 않으므로**(코드 확인) 화면 쪽에서 `duplicate_of is null`만 보이게 하는 작은 변경이 CC-08에 필요 — 대표 판단 요청.

## 적용 순서 (승인 후)
1. 사전 읽기: `customer_review_status` 없음, CX-12 함수 앵커 각 1번, `store_accounts` 행 수.
2. up 1회(3초 잠금 대기·30초 제한). **같은 트랜잭션에서 `admin_audit_logs`에 `db_migration_applied` 기록**(`README.md` 규칙).
3. 사후 읽기: 열·테이블·함수 5개·트리거, 모든 기존 계정 `confirmed`, 권한(anon·authenticated 불가), CX-12 함수 ACL·invoker·표식 1개.
4. 이 문서에 승인 문구 원문·audit id 기록 → CC-08 화면(주문함 배지·[거래처 확인]·후보·연결, `/api/orders` 오류 매핑 `store_customer_review_required` → 안내) 진행.
5. down(`...CX-13-...down.sql`): 미확인 계정이 하나라도 있으면 `cx13_down_refused_unconfirmed_accounts`, 이력이 있으면 `cx13_down_refused_review_history_exists` 거부 → CX-12 함수를 이전 정의로 정확히 복원하고 트리거·함수·테이블·열 삭제.

## 격리 검증 (CI PG17, `tests/sql/store-customer-review-cx13.pg17.test.sql` — CX-12 테스트 직후 같은 DB, 로컬 Docker PG17에서도 통과)
기존 계정 전부 `confirmed` · 새 연결은 `needs_review` · 후보(사업자번호/이름+주소/없음, 계정 있는 거래처·다른 회사 제외) · **G1**(주문 접수된 상태에서 확인·배송완료 시도 거부, 링크 주문 영향 없음, 확인 뒤 정상) · 확인(상태·처리자·이력·멱등·다른 회사 거부) · 연결 거부 6종(이미 확인됨·대상에 계정 있음·같은 거래처·다른 회사·새 거래처에 링크 있음·자동 생성 아님 — 거부 시 데이터 불변) · 연결 성공(계정 이동·확인·빈 거래처 표시·이력) · 권한 · down 거부 2종 → 정확 복원(CX-12 함수 정의·ACL 동일) → 재 up.
