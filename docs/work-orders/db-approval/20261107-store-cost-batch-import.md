# 매장 원가 일괄 반영 DB 승인 대기

- 상태: **미적용 초안**
- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 선행 초안: `20261105-store-cost-management.sql`
- 적용 파일: `docs/sql-drafts/20261107-store-cost-batch-import.sql`
- 되돌리기: `docs/sql-drafts/20261107-store-cost-batch-import.down.sql`
- 검증: `docs/sql-drafts/20261107-store-cost-batch-import.pg17.test.sql`

## 경계

- 최대 2,000개의 04 정규화 행을 RPC 한 트랜잭션에서 반영한다. 한 행이라도 실패하면 현재 원가·이력·import 기록이 모두 롤백된다.
- 회사·매장·활성 owner/manager를 함수 안에서 다시 확인한다. 브라우저 역할에는 테이블/RPC 권한을 주지 않는다.
- 클라이언트 UUID `importId`와 회사·매장·정규화 행으로 DB가 digest를 계산한다. 같은 UUID·같은 행은 replay하며 같은 UUID·다른 행은 거절한다.
- 파일명은 표시 메타데이터일 뿐 digest나 권한의 신뢰 근거가 아니다.
- 각 행은 기존 `save_store_cost`를 호출하므로 현재 원가와 append-only revision이 함께 보존된다.
- 운영 적용, `STORE_COSTS` 활성화, 배포는 별도 승인 전까지 금지한다.

## 승인 기록

| 항목 | 값 |
|---|---|
| DB-APPROVED | 대기 |
| 운영 적용 | 미실행 |
| 기능 플래그 | OFF |
