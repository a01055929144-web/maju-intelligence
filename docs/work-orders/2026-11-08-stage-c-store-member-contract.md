# 단계 C 매장 구성원 인증 계약

상태: 개발 계약. 운영 DB 적용·기능 ON 승인 아님. Owner: 07 organization/auth.

## 07이 보장하는 값

주문 링크에서 서버가 해석한 `companyId/customerId`를 `getStoreOrderMemberContext`에 전달하면 07은 서명된 매장 세션과 활성 `app_users`, 활성 매장, 같은 회사·매장의 활성 구성원을 다시 대조한다. 성공 결과만 `authUserId/companyId/customerId/storeAccountId/memberId/role`을 반환한다. `owner/manager/staff` 모두 주문 구성원이 될 수 있다.

공개 요청의 `companyId`, `customerId`, `storeAccountId`, `memberId`, `role`, actor key는 인증 근거로 쓰지 않는다. 공개 링크 토큰은 문서·거래처 범위를 찾는 값이며 주문 자격이 아니다.

## 09 주문에 전달할 계약

09는 공개 조회·장바구니를 유지하되 주문 생성·수정 전에 링크로 해석한 회사/거래처를 위 helper에 전달한다. 반환된 `storeAccountId/memberId`를 주문 RPC에 전달하고, RPC가 링크 회사·거래처와 활성 매장·구성원을 트랜잭션 안에서 다시 확인한 뒤 기존 `store_orders.store_account_id/ordered_by_member_id`에 기록해야 한다. 공개 토큰 단독 주문, 제거된 구성원, 다른 회사·매장은 거부한다. 07은 09 주문 UI/RPC를 수정하지 않는다.

## 03 수락에 전달할 계약

03의 기존 수락 RPC는 수정하지 않는다. 03 후속 Use Case에는 카카오 흐름 또는 회사 직원 대리 수락에서 서버가 검증한 `acceptedVia`, actor key, token-derived document/version/send 컨텍스트만 전달한다. 브라우저가 보낸 회사·거래처·리드·가격·actor key는 신뢰하지 않는다. 03 결과의 `customerId/needsReview/orderEnabled/storefrontLinkId` 중 `customerId`만 07 주문 구성원 조회의 거래처 범위가 된다.

## 권한표

| 행동 | owner | manager | staff |
| --- | --- | --- | --- |
| manager 초대 | 가능 | 불가 | 불가 |
| staff 초대 | 가능 | 가능 | 불가 |
| manager 내보내기 | 가능 | 불가 | 불가 |
| staff 내보내기 | 가능 | 가능 | 불가 |
| 주문 구성원 인증 | 가능 | 가능 | 가능 |

owner 내보내기·소유권 이전과 고객사 직원의 대리 지정/해제는 별도 사업자 확인·감사 RPC 승인 전 보류한다.

## 09 화면 연결 계약

09는 주문 링크로 서버에서 확인한 `companyId/storeAccountId`가 있을 때 `/store/members?companyId=...&storeAccountId=...` 링크만 노출한다. 또는 독립 컴포넌트 `StoreMemberManagementPanel`에 같은 두 값을 전달할 수 있다. 컴포넌트와 `GET /api/store/members`는 브라우저 역할 값을 신뢰하지 않고 매장 세션과 활성 구성원을 서버에서 다시 검증한다. 기능 플래그 OFF 또는 미허용 회사에서는 관리 진입점을 노출하지 않는다.
