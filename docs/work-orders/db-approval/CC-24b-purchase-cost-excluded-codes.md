# CC-24b 매입가 업로드 "제외 코드" 목록 테이블 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 지시서 `docs/dispatch/2026-11-11-products-partners.md` CC-24 **4-1** "매입가 업로드 때 필요 없는 코드 — 줄마다 `제외` 체크 + '이 코드 다음에도 제외'(회사별 제외 코드 목록, 브라우저 아님)".
**운영 SQL 미실행.** 화면·API·기능 스위치·배포 변경 없음. 적용은 대표 명시 승인 문구 후.
요청 문구(안): `fcmdvveqmcgtioelzqun CC-24b 매입가 업로드 제외 코드 SQL 승인`

## 왜 새 테이블이 필요한가
회사별 설정을 담는 기존 테이블(`pricing_settings`는 기본 마진·올림만, 회사 설정은 열 고정)에 "코드 목록"을 넣을 자리가 없다. 열을 늘리거나 JSON으로 우겨 넣으면 중복 방지·한 줄 삭제가 어려워 **작은 새 테이블 1개**가 가장 단순하다(지시서: "기존 테이블로 안 되면 SQL 초안 → 승인").

## 무엇이 바뀌나 (`docs/sql-drafts/20261112-CC-24b-purchase-cost-excluded-codes.sql`)
| 대상 | 내용 |
|---|---|
| `purchase_cost_excluded_codes` (새 테이블 1개) | `company_id`(회사 삭제 시 같이 삭제) · **`supplier_id`(비어 있으면 회사 전체, 있으면 그 매입처 업로드에서만 제외 — 다른 회사 매입처는 키로 불가, 매입처를 지우면 그 매입처의 코드만 같이 지워지고 회사 전체 코드로 바뀌지 않음)** · `code`(앞뒤 공백 없음, 1~80자) · 만든 사람·시각. **같은 (회사, 매입처 또는 회사 전체, 코드[대소문자 무시])는 한 번만**(`company_id, coalesce(supplier_id, 영 UUID), lower(code)` 유일 인덱스) — 같은 코드가 매입처마다 따로 있어도 되고 회사 전체에도 있어도 됨. RLS 켬, 앱 역할(`anon`·`authenticated`) 권한 없음, `service_role`만 읽기·넣기·지우기(수정 없음) |
- 기존 테이블·함수·데이터 변경 없음, 처음엔 빈 테이블. 적용만으로 업로드 동작은 **바뀌지 않는다**(화면·API가 쓰기 전까지 아무도 읽지 않음).
- 앱 서버가 대표·관리자만 쓰게 막고 회사 경계를 정한다(다른 service-only 테이블과 같은 방식).

## 적용 순서 (승인 후)
1. 사전 읽기: `purchase_cost_excluded_codes` 없음, `companies`·`product_suppliers`(키 `(company_id,id)`) 있음.
2. up 1회(3초 잠금 대기·30초 제한, 이미 있으면 `cc24b_already_applied`로 중단). **같은 트랜잭션에서 `admin_audit_logs`에 `db_migration_applied` 기록**(`README.md` 규칙).
3. 사후 읽기: 테이블 존재·RLS 켜짐·`anon`/`authenticated` 접근 불가·`service_role` 읽기/넣기/지우기 가능·행 0개.
4. 이 문서에 승인 문구 원문·audit id 기록 → **화면·API 단계**(아래) 진행.
5. down(`...CC-24b-...down.sql`): 테이블 삭제. **목록에 코드가 하나라도 있으면 `cc24b_down_refused_codes_exist`로 거부**(설정 유실 방지).

## 승인 뒤 만들 것 (이 SQL 밖, 별도 PR)
- `GET/POST/DELETE /api/price-sheets/excluded-codes`(대표·관리자만, 회사 고정, 한 번에 코드 1~200개·80자·공백 정리, 매입처는 이 회사 것만).
- 매입가 업로드 미리보기: 줄마다 `제외` 체크, 체크한 줄의 **"이 코드 다음에도 제외"**(범위: **이 매입처만**[기본] · 회사 전체) 체크, 다음 업로드부터 해당 범위의 코드는 자동 제외(미리보기에 "제외 코드 N줄 건너뜀" + 코드 목록 보기·지우기). 코드 칸이 비어 있는 줄은 "다음에도 제외"를 못 고름.
- 이미 들어온 상품은 4(삭제 화면, 11/12 배포)로 지움.

## 격리 검증 (CI PG17, `tests/sql/purchase-cost-excluded-codes-cc24b.pg17.test.sql`, 로컬 Docker PG17에서도 통과)
권한(앱 역할 불가·service_role 읽기/넣기/지우기만·수정 불가)·RLS 켜짐 · 같은 코드를 두 회사에 넣기 허용 · 같은 회사 대소문자만 다른 코드 거부 · **매입처 A·B·회사 전체에 같은 코드 허용, 같은 범위 안 중복(대소문자 무시·회사 전체 NULL 포함) 거부, 다른 회사 매입처 거부, 매입처 삭제 시 그 매입처 코드만 삭제(회사 전체 코드로 안 바뀜)** · 공백 낀·빈·81자 코드 거부 · 없는 회사 거부 · 회사 삭제 시 그 회사 코드만 삭제 · down 거부(코드 있을 때) → 비운 뒤 down → 재 up.
