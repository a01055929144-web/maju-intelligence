# 거래처 저장·가져오기 이력 원자성 DB 승인 대기

- 상태: **미적용 초안**
- 기준 커밋: `107f79e`
- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 적용 후보: `docs/sql-drafts/20261107-customer-import-atomicity.sql`
- 검증: `docs/sql-drafts/20261107-customer-import-atomicity.pg17.test.sql`

## 조사 결과

- 현재 수기 저장과 엑셀 거래처 저장은 `normalized_customers` 쓰기와 `customer_imports` 상태 변경을 서로 다른 REST 요청으로 수행한다.
- 기존 마이그레이션·SQL 초안·저장소 코드에는 이 두 작업을 한 트랜잭션으로 묶는 RPC가 없다.
- 오래된 `processing` 행을 자동으로 완료/실패 판정할 근거도 없다. 고객 행이 실제로 저장됐는지, 후속 분석까지 끝났는지를 현재 이력만으로 확정할 수 없으므로 자동 복구는 안전하지 않다.

## 최소 활용안

1. 서버가 요청마다 UUID `importId`와 정규화한 요청 본문의 SHA-256 `requestDigest`를 만들고 같은 값으로 RPC를 재시도한다.
2. 수기·엑셀 거래처 마스터 저장만 이 RPC로 보낸다. 매출 분석 업로드는 현재 경로를 유지한다.
3. RPC는 파일·`processing` 이력을 만든 뒤 내부 하위 트랜잭션에서 원본 행·매핑·거래처를 저장한다.
4. 저장 성공 시 `completed`, 실패 시 고객 변경을 되돌리고 `failed`와 오류를 남긴다.
5. 같은 `importId`·digest 재시도는 기존 `completed/failed` 결과를 반환하고, digest가 다르면 거부해 다른 업로드 결과로 오인하지 않게 한다.
6. 앱 코드 전환은 운영 SQL 적용 및 아래 승인 후 별도 PR로 진행한다.

## 승인표

| 확인 항목 | 상태 |
|---|---|
| PostgreSQL 17 성공·실패·재시도·회사 격리 검증 | 대기 |
| 운영 스키마의 선택 컬럼/제약과 초안 비교 | 대기 |
| 기존 `processing` 행 읽기 전용 목록·건별 판정 | 대기 |
| RPC의 `service_role` 전용 실행 권한 확인 | 대기 |
| 오류 메시지의 개인정보·원문 데이터 비노출 확인 | 대기 |
| 요청 digest 산출 규칙과 25MB/5,000행/매핑 200개 상한 확인 | 대기 |
| 매출 분석 업로드 제외 범위 확인 | 대기 |
| 운영 적용 승인 `DB-APPROVED: fcmdvveqmcgtioelzqun YYYY-MM-DD HH:MM KST` | 대기 |
| 앱 저장 코드 전환 승인 | 대기 |

## 운영 경계

- 이 PR은 `supabase/migrations` 파일을 추가하지 않고 운영 DB에 실행하지 않는다.
- 기존 `processing` 이력을 자동 수정하거나 고객 데이터를 복구·삭제하지 않는다.
- 운영 적용 전 기존 `processing` 건은 생성 시각, 연결 고객 수, 원본 파일을 읽기 전용으로 대사해 건별 승인한다.
- 앱 전환 전까지 현재 REST 저장 흐름은 그대로다.
