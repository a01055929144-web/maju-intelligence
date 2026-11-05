# 매장 카카오 세션 경계 조사

Owner: organization. Related: store, order.

## 결론

현재 저장소에는 매장 점주·관리자·직원을 위한 서버 세션이 없다. 기존 `getCustomerSession()`은 유통사 회사 구성원용이며 매장 원가 API 인증에 재사용하면 안 된다. 따라서 `getStoreCostMemberAccess()`를 API에 연결하는 작업은 매장 전용 카카오 콜백과 세션이 생길 때까지 보류한다.

## 확인 근거

- `app/api/auth/kakao/start/route.ts`는 직원 초대, 개인 워크스페이스, 기존 고객사 계정 연결만 OAuth state에 담는다.
- `app/api/auth/kakao/callback/route.ts`는 `acceptStaffKakaoInvitation()` 또는 `createPersonalKakaoWorkspace()`를 실행한 뒤 `setCustomerSession()`만 호출한다.
- `lib/auth.ts`의 로그인 쿠키는 관리자용 `maju_admin_session`과 고객사 구성원용 `maju_customer_session`뿐이다.
- 애플리케이션 코드에는 `store_account_members`의 `auth_user_id`를 카카오 인증 결과와 연결하거나 매장 세션 쿠키를 발급·검증하는 흐름이 없다.
- `store_account_members`는 service role 전용이고 RLS가 켜져 있으므로 공개 링크나 브라우저에서 직접 조회할 수 없다.

## 필요한 최소 선행 경계

1. 기존 카카오 OAuth start/callback에 서명된 `store` 목적을 추가한다. 콜백 query의 임의 값이 아니라 기존 일회용 OAuth state로 목적을 검증한다.
2. 카카오 provider ID를 서버에서 내부 사용자 UUID로 해석한다. 요청 본문의 `authUserId`나 공개 링크 토큰을 사용자 신원으로 인정하지 않는다.
3. 고객사 쿠키와 이름이 다른 HttpOnly 매장 세션 쿠키를 발급한다. 쿠키에는 최소 내부 사용자 UUID와 발급 시각만 서명해 담고, 회사·매장·역할은 신뢰 가능한 세션 값으로 고정하지 않는다.
4. 매장 API는 매 요청마다 세션의 내부 사용자 UUID와 `(company_id, store_account_id)`를 `store_account_members`에 함께 대조한다. 활성 구성원만 허용하고 현재 역할을 DB에서 읽는다.
5. 조회는 owner/manager/staff, 업로드·정정은 owner/manager만 허용한다. 공개 주문 링크 토큰은 이 경계에 들어오지 않는다.
6. 로그아웃, 만료, 제거된 구성원, 다른 회사·매장, 목적이 다른 OAuth state, 고객사 쿠키만 있는 요청을 각각 거부하는 테스트를 추가한다.
7. 첫 가입은 임의 매장 생성을 허용하지 않는다. 별도 승인된 가입 또는 초대 흐름이 `(company_id, store_account_id)`와 역할을 서버에서 결정한 뒤에만 `store_account_members`를 만든다. 초대 토큰은 해시로 보관하고 일회성·만료·대상 매장 일치를 검증하며, owner 생성·이전은 일반 직원 초대와 분리해 승인한다. 이 생성 RPC/트랜잭션과 PG17 회사 격리 검증은 DB 승인 대상이다.

## 발급·폐기 순서

1. start route가 `store` 목적과 초대 식별자를 일회용 서명 OAuth state에 넣는다.
2. callback이 state와 카카오 code를 검증하고 provider ID를 내부 사용자 UUID로 해석한다.
3. 기존 활성 구성원이면 구성원 생성 없이 진행한다. 첫 가입·초대면 승인된 서버 트랜잭션이 대상 회사·매장·역할을 확정해 구성원을 만든다.
4. callback이 매장 전용 HttpOnly 서명 쿠키를 발급한 뒤에만 원가관리 화면으로 이동한다.
5. API는 쿠키의 사용자 UUID를 다시 `(company_id, store_account_id, status='active')`와 대조한다. 역할은 이 조회 결과만 사용한다.
6. 로그아웃은 매장 쿠키만 삭제한다. 고객사 세션과 매장 세션을 서로 대신 삭제하거나 전환하지 않는다.
7. 만료·서명 실패·구성원 제거 시 API는 즉시 거부하고 매장 쿠키를 폐기한다. 서버 측 세션 레코드를 도입한다면 레코드를 먼저 revoke한 뒤 쿠키를 삭제한다.

## 03 API 호출 계약

현재는 호출 금지다. 매장 세션 선행 작업이 완료된 뒤 API가 사용할 계약은 다음과 같다.

```ts
const storeSession = await getStoreSession();
if (!storeSession) return unauthorized();

const member = await getStoreCostMemberAccess({
  authUserId: storeSession.userId,
  companyId,
  storeAccountId
});
```

`authUserId`는 URL, JSON body, header, 고객사 `getCustomerSession()`, 공개 링크 토큰에서 가져오지 않는다. `getStoreCostMemberAccess()`는 구성원 `id`, 현재 `role`, `active` 상태만 반환한다.

## 구현 판단과 차단 지점

카카오 provider ID에서 기존 `app_users.id`를 찾는 코드는 있지만, 이를 `store_account_members.auth_user_id`의 공식 대상이라고 보장하는 FK나 애플리케이션 계약이 없다. 더 중요한 차단점은 첫 owner 또는 초대 구성원을 원자적으로 만드는 승인된 RPC가 없다는 것이다. 콜백에서 service role REST 호출 여러 번으로 계정·구성원·이벤트를 만들면 중간 실패, owner 중복, 초대 재사용 경쟁을 막을 수 없다. 따라서 추가 승인 없이 OAuth callback과 쿠키만 구현하는 것은 사용 가능한 로그인 흐름이 아니며 진행하지 않는다.

### DB 승인표 초안

| 승인 항목 | 최소 계약 | 실패 시 위험 |
| --- | --- | --- |
| 사용자 기준 | `auth_user_id`가 `app_users.id`임을 명시하고 FK 또는 동일 수준의 검증을 둔다. 기존 null·고아 값을 먼저 진단한다. | 카카오 계정과 다른 내부 사용자가 연결됨 |
| 구성원 유일성 | 같은 `(company_id, store_account_id, auth_user_id)`의 활성 구성원을 하나로 제한한다. 여러 유통사·매장 소속 자체는 허용한다. | 한 매장에서 역할이 중복·충돌함 |
| 첫 owner | 승인된 store account에 한해 owner 한 명을 만드는 별도 관리자 절차/RPC를 둔다. 공개 callback은 매장이나 owner를 임의 생성하지 않는다. | 임의 매장 탈취·owner 중복 |
| 직원 초대 | 초대 hash, 만료, 대상 회사·매장·역할, 미사용 상태를 잠그고 검증한 뒤 구성원과 이벤트를 한 트랜잭션에서 만든다. | 초대 재사용·교차 매장 가입·부분 저장 |
| owner/manager 변경 | owner 이전과 manager 지정은 일반 직원 초대와 분리하고 기존 active owner를 잠근다. | owner 부재 또는 복수 owner |
| 권한 | RPC와 테이블은 public/anon/authenticated 접근을 막고 service role만 호출한다. 원문 토큰을 저장·로그하지 않는다. | 공개 클라이언트에서 구성원 생성 |
| PG17 | 동시 초대 수락, 만료·재사용, 교차 회사/매장, owner 경쟁, 제거 후 재로그인, down 안전성을 폐기 가능한 PG17에서 검증한다. | 운영에서만 격리·경쟁 오류 발견 |

승인 전 상태는 기능 플래그 OFF, 매장 OAuth 목적 미노출, 03 원가 API 미연결이다. 승인 SQL은 별도 PR과 운영 적용 승인을 거쳐야 하며 이 문서 PR에서는 만들거나 실행하지 않는다.

## 범위 밖

- 새 로그인 화면이나 아이디·비밀번호 인증
- 운영 DB 변경
- 공개 주문 링크 인증과 매장 구성원 인증의 통합
- 고객사 구성원 세션의 매장 세션 전환
