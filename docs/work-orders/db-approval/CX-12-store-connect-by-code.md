# CX-12 초대코드로 유통사 연결 — 운영 승인 대기

Ponytail: 사용함 (Claude Code ponytail-review). 설계 `docs/design/2026-11-11-store-direct-signup.md` 2절(b)·6절, 지시서 `docs/dispatch/2026-11-11-R2-store-signup.md` CX-12.
**운영 SQL 미실행.** 플래그·배포·기존 데이터 변경 없음. 적용은 대표 명시 승인 문구 후, 아래 순서대로. 선행: CX-10(적용·백필 완료), 개업 예정 지원(`store-preopening`, 운영 적용 확인됨).

## 무엇이 생기나 (`docs/sql-drafts/20261111-CX-12-store-connect-by-code.sql`)

함수 1개 `connect_store_profile_by_invite_code_v1(p_auth_user_id, p_store_profile_id, p_code_hash)` — service_role 전용, security invoker. 새 테이블·열 없음.

| 단계 | 동작 |
|---|---|
| 권한 | 프로필의 **활성 점주 본인**만(구성원·상태 확인, 정지된 프로필 불가) |
| 코드 | 살아 있는 코드(미회수·미만료)만. **없는/만료/회수 코드가 모두 같은 오류 `store_invite_code_invalid`** → 코드를 추측해 볼 수 없음 |
| 중복 | 같은 회사+프로필은 `alreadyLinked`로 그대로 반환(두 번 눌러도 1건) |
| 거래처 | **항상 새 `normalized_customers` 생성**(이름·주소·`normalized_key='profile:<id>'`, 출처 `store_profile_invite`) |
| 연결 | `store_accounts`(`registration_pending`, 사업자번호 없음, 약관은 프로필 가입 때 것 그대로, `store_profile_id`·`invite_code_id` 기록) + 점주 구성원 + `join` 이벤트 |

**의도적으로 하지 않는 것(보안)**: 이름·주소가 같은 **기존 거래처에 자동으로 붙이지 않는다.** 코드를 가진 쪽이 이름·주소만 맞추면 다른 거래처의 주문 이력에 접근할 수 있기 때문. 합치기는 유통사가 확인하는 CX-13 몫.
사업자번호는 프로필에 남고, 유통사 쪽 계정은 확인 전(`registration_pending`)으로 둔다. 다른 구성원(관리자·직원) 복사는 하지 않음(점주만) — 후속.

## 적용 순서 (승인 후)
1. 사전 읽기: 함수 없음(`to_regprocedure`), CX-10 테이블 있음, `store_accounts` 건수 기록.
2. up 1회(3초 잠금 대기·30초 제한, 이미 적용이면 `cx12_already_applied`로 중단).
3. 사후 읽기: 함수 존재·invoker, anon/authenticated 실행 불가·service_role 가능, `store_accounts`·거래처 건수 불변.
4. down: 코드로 연결된 계정(`invite_code_id` 있음)이 하나라도 있으면 `cx12_down_refused_existing_connections`로 거부.

## 격리 검증 (CI PG17, `tests/sql/store-connect-cx12.pg17.test.sql`)
권한(anon/authenticated 불가) · 연결 결과 행 · **같은 이름·주소의 기존 거래처에 붙지 않음** · 재시도 멱등 · 두 번째 유통사 연결과 **회사 간 비노출** · 없는/만료/회수 코드 오류 문구 동일·행 미생성 · 타인·정지 프로필 거부 · down 거부 → 정리 후 down → 재up.

## 적용 기록 (2026-11-12)
- 승인 문구 원문(대표 메시지 그대로): `fcmdvveqmcgtioelzqun CX-12 초대코드 연결 SQL 승인`
- 승인 시각: 2026-11-12 09:46 KST 직전(메시지 수신의 정확한 시각은 기록하지 못함 — 적용 09:46:19 KST 이전). 초안 커밋 `8ec371e`.
- **감사 기록(`admin_audit_logs`)**: 적용 직후 같은 날 별도로 추가(id `268c43ea-5c46-4189-a91c-81c0ac28540a`, action `db_migration_applied`, target_type `migration`, actor·company 없음 — 기존 CC-22a·19a·26a와 같은 형식, metadata에 id·승인 문구·시각·초안 커밋·`recorded_late: true`). 읽기로 확인함. **이번 3건만 사후 기록**이며, 이후 적용은 같은 트랜잭션 안에서 남긴다(`README.md`).
- 적용: 운영 `fcmdvveqmcgtioelzqun`에 초안 SQL 1회 적용(Supabase `apply_migration` `cx12_store_connect_by_code`, 성공). 선행 검사 통과(이미 적용 아님).
- 사전 읽기: CX-10 테이블(store_profiles 등) 존재 확인은 SQL 선행 검사가 수행, 함수 없음.
- 사후 읽기: `connect_store_profile_by_invite_code_v1(uuid,uuid,text)` 존재, anon·authenticated·PUBLIC 권한 없음. 호출하지 않았으므로 데이터 변경 없음. **매장 초대코드 입력은 여전히 전역 `STORE_DIRECT_SIGNUP_ENABLED` 스위치 OFF + 회사별 스위치 없음**이라 열리지 않음.
- 데이터 변경: 없음. 화면·배포는 별도 단계.
