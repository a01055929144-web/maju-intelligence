# CX-144 — 카카오 매장 탈퇴 + 사업자번호 없이 초대 가입 (2026-11-24, 대표 결정)

대표 요구(21:38): ① 카카오톡 매장 탈퇴가 있어야 한다 ② 사업자번호 없이 들어갈 수 있어야 한다 ③ 거래처 화면에서 점주 개통 링크가 안 보인다.
대표 결정(21:4x): **번호 없는 매장도 가격은 보여주고, 주문할 때 번호 등록(국세청 정상 확인) 후 주문** · **탈퇴 = 매장 연결 끊고 같은 카카오로 다시 가입 가능(주문 기록은 남김)**.

Owner Domain: organization(store account) · Related: pricing(가격 공개), lead(CX-142 연결)
한 PR = 한 고객 행동 → U0·U1·U2·U3 각각 PR. 모두 새 플래그 기본 OFF + 대표 회사 allowlist.

## 지금 운영 사실 (컨트롤타워 확인)
- 탈퇴: `/store/connection` 화면·`/api/store/connection`·`change_store_connection_v1`(owner=`close`, 구성원=`leave`)이 **이미 있다**. 그런데 ① `STORE_CONNECTION_MANAGEMENT_ENABLED`가 운영에 없음(404) ② 매장 화면 어디에도 링크가 없음.
- 탈퇴 후 재가입 불가: `prepare_store_owner_activation_v1`은 해당 거래처에 store_accounts가 **하나라도 있으면**(closed 포함) `store_account_exists`.
- 번호 없는 초대 불가: 같은 함수가 거래처 번호 10자리가 아니면 `store_customer_business_number_required`. 카카오 콜백도 국세청 '정상'이 아니면 막음.
- 번호 없는 가입은 공개 링크 경로에만 있음(`STORE_PREOPENING_ENABLED` 운영 ON, `registration_pending`). 이 상태는 `set_store_price_visibility_v1`·`finalize_store_signup_v1` 모두 가격 확인을 막는다.
- 거래처 화면 버튼: 대표·관리자 세션 + provision 탐침(403)일 때만 보이고, 번호 없는 거래처는 "사업자번호 10자리 등록 후 개통"(비활성)으로 보인다. 대표 화면에서 안 보이는 원인 미확정(스크린샷 요청) — U3에서 상태 문구로 해결.

## U0 — MAJU 관리자에서 매장 연결 관리 (먼저, 대표 추가 요구 21:44)
- `/admin` 매장(store_accounts) 상세에 버튼 3개: **매장 탈퇴 처리**(close와 같은 결과) · **점주/구성원 연결 해제**(member별) · **점주 추가**(카카오 초대 링크 발급 → 기존 activation 경로 재사용).
- 기존 `change_store_connection_v1`은 매장 구성원 본인 전용이라, 관리자용은 별도 함수(관리자 키를 event actor로 기록)로. 초안+down+PG17.
- 탈퇴 처리한 거래처는 다시 초대 가능해야 함(U1 SQL과 같은 변경 — U0에 먼저 넣고 U1은 재사용).
- MAJU 관리자만(고객사 세션 불가). 테스트 반복에 쓰므로 U1보다 먼저.

## U1 — 매장 탈퇴 (매장 앱)
- 매장 홈 메뉴(설정/내 정보 근처)에 **"매장 탈퇴"** 링크 → 기존 `/store/connection` 재사용. 대표(owner)는 "매장 탈퇴(이용 종료)", 구성원은 "내 연결 해제". 확인 단계 1번(되돌릴 수 없음 안내), 완료 후 로그아웃·카카오 로그인 화면.
- SQL(초안+down+PG17): `prepare_store_owner_activation_v1`에서 **closed 매장만 있는 거래처는 다시 초대 가능**하게. 새 store_account를 만들지, closed 행을 다시 여는지 설계 비교 후 보고(주문·활동 기록은 이전 매장 행에 남아야 함).
- 플래그: `STORE_CONNECTION_MANAGEMENT_ENABLED` + 대표 회사.
- 테스트: owner 탈퇴 → 같은 거래처 재초대 → 같은 카카오로 재가입 성공 / 구성원 leave / 다른 회사 매장 접근 불가.

## U2 — 사업자번호 없이 초대 가입
- 거래처에 번호가 없어도 초대 링크 발급. 가입 때 번호 입력 칸(선택): 입력+국세청 정상 → 지금과 같음(active, CX-142 자동 확인). 비우면 → 번호 없는 매장으로 가입.
- **번호 없는 매장도 가격 공개**(대표 결정): 초대·회사 링크 가입이면 가격 보이게. 기존 preopening 가격 차단 규칙과 충돌하므로 상태값·함수 변경을 설계해서 보고(예: `business_status='registration_pending'`이어도 초대 가입이면 자동 확인).
- **주문은 번호 등록 후**: 주문 버튼에서 번호 입력 → 국세청 정상 → 거래처·매장 번호 저장 → 주문. 번호가 다른 거래처와 겹치면 기존 매칭 규칙(사업자번호 우선)으로 처리하고 자동 병합은 하지 않음.
- 매입가 노출 금지 유지. 플래그 기본 OFF.

## U3 — 거래처 화면 개통 링크 버튼
- 대표·관리자에게는 항상 보이게: 번호 없으면(U2 켜진 회사) 그대로 발급, 아니면 이유 문구. 모바일 390에서도 상세 패널에 보이는지 e2e layout.
- `?customerId=` 로 들어오면 그 거래처가 선택돼 있어야 함(지금 동작 확인 후 깨져 있으면 수정).

## 같이 고칠 것 (P2, CX-142 후속)
- `findSignupLeadId`: 거래처에 번호가 있으면 리드를 번호로만 찾아서, **이미 그 거래처로 전환된 리드(matched_customer_id = 거래처)**를 못 찾는다. 이미 연결된 리드를 먼저 쓰도록. U2 PR에 포함 가능.

## Do Not Touch
가격 계산(`self_order_price_v2`)·매입가 노출 경로·CX-140 링크 규칙. 테스트를 약하게 바꿔 CI 통과 금지.

## 완료 기준
대표가 카카오로 ① 번호 없이 초대 가입 → 가격 보임 → 주문 시 번호 요구 ② 매장 탈퇴 → 같은 거래처 재초대 → 재가입 을 끝까지 할 수 있다.
