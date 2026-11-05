# 매장 자체 원가관리 DB 승인 대기

- 상태: **미적용 초안**
- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 적용 파일: `docs/sql-drafts/20261105-store-cost-management.sql`
- 되돌리기: `docs/sql-drafts/20261105-store-cost-management.down.sql`
- 검증: PostgreSQL 17 전용 테스트에서 회사·매장 격리, 재업로드 멱등성, 중복 상품, 안전한 down을 확인한다.

## 경계

- 저장 항목은 매장 자체 `품목명 / 규격 / 단위 / 적용일 / 원화 원가`뿐이다.
- 유통사 매입가, 공급처, 마진, 가격표 데이터와 FK·조회·권한을 공유하지 않는다.
- 브라우저 역할에는 권한을 부여하지 않는다. server-only API가 07의 활성 매장 멤버 helper를 통과한 뒤 `service_role`로 회사·매장 범위를 항상 함께 지정한다.
- 변경 이력은 `service_role`에 `SELECT/INSERT`만 부여해 append-only로 유지한다. DB 소유자는 장애 복구를 위해 제외하며, 운영 변경은 별도 승인·감사 대상이다.
- 쓰기는 `save_store_cost` RPC 한 번으로 현재값 갱신과 revision 삽입을 같은 transaction에서 수행한다. 낙관적 revision 충돌은 전체 롤백되고, 업로드 재시도는 `(SHA-256, 원본 행 번호)`로 replay 처리한다.
- DB 방어선에서도 활성 `owner/manager`만 쓰기를 허용한다. 과거 적용일 업로드는 현재 원가를 덮지 않고 이력에만 남긴다.
- 기존 원가 객체가 있으면 초안은 `IF NOT EXISTS`로 지나가지 않고 실패한다. 운영 적용 전에 기존 형태를 수동 비교한 뒤 승인한다.
- 운영 적용과 기능 활성화는 별도 대표 승인 뒤에만 한다. 기본 플래그는 OFF다.

## 승인 기록

| 항목 | 값 |
|---|---|
| DB-APPROVED | 대기 |
| 운영 적용 | 미실행 |
| 기능 플래그 | OFF |
