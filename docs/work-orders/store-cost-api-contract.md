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

GET은 50행 고정 페이지이며 성공 응답은 `{ rows, hasMore, nextOffset }`, PATCH는 `{ id, revision, replayed }`이다. 다음 페이지는 응답의 `nextOffset`을 그대로 전달한다. 인증 없음 401, 권한 부족 403, 기능 OFF 또는 항목 없음 404, revision 충돌 409를 반환한다.

## 엑셀 파서 연동과 일괄 반영

04 파서가 만든 정규화 행만 `/api/store/costs/import`에 전달한다. 서버는 파일을 다시 파싱하지 않으며 파일명은 표시 메타데이터로만 저장한다.

- 미리보기: `{ mode: "preview", companyId, storeAccountId, importId, fileName, rows }`
- 명시적 반영: 위 필드에 `{ mode: "apply", confirmationHash }`를 추가
- `importId`: 브라우저가 업로드 시 한 번 생성하고 재시도 동안 유지하는 UUID
- `rows[]`: `{ effectiveOn, productName, specification?, unit, costKrw, sourceRowNumber }`
- 미리보기 응답: `{ confirmationHash, importId, fileName, rows }`
- 반영 응답: `{ imported, replayed, total, importDigest }`

서버는 두 요청 모두 활성 owner/manager를 다시 확인하고 행을 재검증한다. 확인 해시는 회사·매장·importId·정규화 행에 묶이며, 미리보기 뒤 행이 달라지면 409로 거절한다. DB batch RPC는 같은 범위와 UUID·행으로 자체 digest를 계산해 같은 재시도를 replay하고, 같은 UUID로 다른 행을 보내면 충돌 처리한다. `20261107-store-cost-batch-import.sql` 승인·적용 전에는 기능 플래그를 켜지 않는다.

행 형식은 `{ effectiveOn, productName, specification?, unit, costKrw }`이며 `costKrw`는 0~10억원의 원 단위 정수다. 공급처·유통사 매입가·마진 필드는 받지 않는다.
