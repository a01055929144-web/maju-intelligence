# 매장 자체 원가 API 계약 (09 UI 연동용)

기능 플래그 `STORE_COSTS`가 회사에 허용되고 DB 초안이 승인·적용된 뒤에만 `/api/store/costs`를 연다. 플래그 기본값은 OFF이며 유통사 직원용 `getCustomerSession()`을 매장 인증으로 대체 사용하면 안 된다.

## 인증 경계

- 03은 07 소유 server-only helper `getStoreMemberContext({ companyId, storeAccountId })`만 호출한다.
- helper 결과의 `memberId`를 변경 RPC의 actor로 사용하고, 회사·매장 범위는 검증에 사용한 값을 그대로 전달한다.
- `authUserId`는 요청 body/query에서 받지 않고 검증된 Kakao 서버 세션에서만 도출한다.
- `store_account_members.auth_user_id`가 현재 Kakao 사용자와 일치하고 `status = 'active'`인 멤버만 허용한다. 공개 링크 token-only 요청은 401/403으로 거부한다.
- helper 구현 파일은 07 소유이므로 03에서 수정하지 않는다. 실제 경로: `lib/store/07-store-member-context.ts`.

## 요청

- `GET ?companyId=<uuid>&storeAccountId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&product=<text>&offset=<number>`: 현재 원가 검색
- `GET ?companyId=<uuid>&storeAccountId=<uuid>&itemId=<uuid>&history=true&offset=<number>`: 항목 변경 이력
- `PATCH`: `{ companyId, storeAccountId, itemId, expectedRevision, row }` 낙관적 잠금 수정

최소 경계에서는 GET과 PATCH만 제공한다. 파일 업로드는 DB 승인 후 별도 작업으로 남긴다. GET은 50행 고정 페이지이며 성공 응답은 `{ rows, hasMore, nextOffset }`, PATCH는 `{ id, revision, replayed }`이다. 다음 페이지는 응답의 `nextOffset`을 그대로 전달한다. 인증 없음 401, 권한 부족 403, 기능 OFF 또는 항목 없음 404, revision 충돌 409를 반환한다.

행 형식은 `{ effectiveOn, productName, specification?, unit, costKrw }`이며 `costKrw`는 0~10억원의 원 단위 정수다. 공급처·유통사 매입가·마진 필드는 받지 않는다.
