# 매장 자체 원가 API 계약 (09 UI 연동용)

기능 플래그 `STORE_COSTS`가 회사에 허용되고 DB 초안이 승인·적용된 뒤에만 `/api/store/costs`를 연다.

## 인증 경계

- 03은 07 소유 server-only helper `getStoreCostMemberAccess({ companyId, storeAccountId, authUserId })`만 호출한다.
- helper 결과 `{ id, role, status }`에서 `id`를 Application의 `memberId`로 사용하고, 회사·매장 범위는 검증에 사용한 값을 그대로 전달한다.
- `authUserId`는 요청 body/query에서 받지 않고 검증된 Kakao 서버 세션에서만 도출한다.
- `store_account_members.auth_user_id`가 현재 Kakao 사용자와 일치하고 `status = 'active'`인 멤버만 허용한다. 공개 링크 token-only 요청은 401/403으로 거부한다.
- helper 구현 파일은 07 소유이므로 이 PR에서 만들거나 수정하지 않는다. 실제 경로: `lib/store/08-store-cost-access.ts`.

## 요청

- `GET ?companyId=<uuid>&storeAccountId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&product=<text>`: 현재 원가 검색
- `GET ?companyId=<uuid>&storeAccountId=<uuid>&itemId=<uuid>&history=true`: 항목 변경 이력
- `POST`: `{ companyId, storeAccountId, fileName, rows[] }` 업로드. 서버가 원본 파일 bytes로 SHA-256을 계산하며 같은 파일과 행 번호는 재처리하지 않는다. 클라이언트가 보낸 hash는 신뢰하지 않는다.
- `PATCH`: `{ companyId, storeAccountId, itemId, expectedRevision, row }` 낙관적 잠금 수정

행 형식은 `{ effectiveOn, productName, specification?, unit, costKrw }`이며 `costKrw`는 0~10억원의 원 단위 정수다. 공급처·유통사 매입가·마진 필드는 받지 않는다.
