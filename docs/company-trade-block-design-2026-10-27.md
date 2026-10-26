# K 회사 내 거래 금지(블랙리스트) 설계 초안

상태: **승인 전 설계안**. 운영 DB 실행, API 연결, 자동 제외, 고객 삭제를 포함하지 않는다.

## 최신 요구

`docs/specs/claude-review-2026-10-26.md`의 K 20:12 확정안을 기준으로 한다.

- 1단계는 회사 안에서만 사용한다.
- 사업자등록번호를 식별 키로 사용하고 사유·메모·등록자를 보관한다.
- 해당 매장은 리드 목록에서 자동 제외하고 경고한다.
- 회사 간 미수·거래 금지 정보 공유는 법률 검토 전 구현하지 않는다.

같은 문서의 B4 연락 거부 요구는 별도 개념이다. 연락 거부는 전화·이메일·인스타처럼 채널별 재접촉을 막고, 거래 금지는 사업자번호 기준으로 신규 거래·전환을 경고 또는 차단한다. 두 목록을 한 테이블로 합치지 않는다.

## 현재 함수와 데이터 모델 조사

| 현재 경로·함수 | 현재 의미 | 거래 금지와의 차이/향후 연결점 |
| --- | --- | --- |
| `recordPermitLeadAction` | 리드 한 건에 행동을 기록하고 `제외` 상태로 변경 | 사업자번호 단위가 아니며 재수집·다른 리드·병합에 자동 유지되지 않는다. 거래 금지 원장으로 사용하지 않는다. |
| `deletePermitLead` | 테스트·명백한 오탐 리드를 물리 삭제 | 거래 금지 처리에 절대 사용하지 않는다. |
| `ingestPermitLeadRows` | 공공데이터·파일 리드를 정규화·upsert | 승인 후 활성 거래 금지 번호를 조회해 경고/제외 판정을 적용할 후보 지점이다. 이번 PR에서는 연결하지 않는다. |
| `listPermitLeads` | 회사별 리드 목록 조회 | 승인 후 활성 거래 금지 존재 여부와 제한된 경고만 표시할 후보 지점이다. |
| `updatePermitLeadProfile` | 사업자번호 수정 및 `canonical_fingerprint` 동기화 | 번호가 바뀌면 승인 후 거래 금지 재판정이 필요하다. 이번 PR에서는 연결하지 않는다. |
| `convertPermitLeadToCustomer` | 리드를 거래처로 전환 | 승인 후 활성 거래 금지 번호이면 전환 전 확인 또는 차단해야 한다. 자동 삭제하지 않는다. |
| `upsertCustomerMaster` | 사업자번호 또는 상호·주소 키로 거래처 생성·수정 | 기존 거래처는 보존한다. 거래 금지 등록만으로 삭제·병합·거래종료 처리하지 않는다. |
| `excludeMatchingLeadsForNewCustomer` | 새 거래처와 중복되는 리드를 자동 표시 | “이미 등록된 거래처” 중복 처리이므로 거래 금지와 섞지 않는다. |
| `setCustomerRelationshipStatus` | 특정 거래처를 `거래중/거래종료`로 표시 | 고객 ID 단위 운영 상태다. 회사별 사업자번호 거래 금지 원장과 독립적으로 유지한다. |
| `mergeDuplicateCustomers` | 같은 회사의 중복 거래처 병합 | 거래 금지 원장은 고객 ID를 키로 삼지 않으므로 병합 후에도 번호 기준으로 유지된다. |

기존 `business_number_exceptions`는 종사업자번호 등 사업자번호 중복을 허용하는 목록으로 의미가 정반대이므로 재사용하지 않는다.

## 권한과 노출 범위

현재 `manage_customers`는 대표·관리자뿐 아니라 영업·배송·일반 직원·알바에도 열려 있고, `manage_company`도 알바를 제외한 대부분 역할에 열려 있다. 따라서 둘 중 하나만으로 등록·해제 권한을 판단하면 요구보다 넓다.

- 별도 capability `manage_trade_blocks`를 추가하고 고객사 `owner`, `manager`에만 부여한다.
- 등록·해제·사유·메모 열람은 대표·관리자만 가능하게 한다.
- 일반 직원 화면에는 업무상 필요한 “거래 금지” 경고만 표시하고 사유·메모·등록자 상세는 숨긴다.
- MAJU 관리자는 현재 `scopeHasCapability`에서 모든 capability를 통과하므로, 신규 API는 이 함수만 사용하지 않는다. 회사 내부 목록이라는 원칙에 따라 MAJU 관리자 기본 조회·수정을 막고, 향후 지원 대행이 필요하면 별도 승인·감사 로그를 설계한다.
- 모든 조회·쓰기에는 인증된 `company_id`를 서버에서 주입한다. 요청 본문의 회사 ID나 전역 사업자번호 검색을 신뢰하지 않는다.
- 회사 간 검색, 집계, 추천, 미수 사유 공유 API를 만들지 않는다.

## 제안 데이터 모델

`company_trade_blocks`는 고객·리드 ID가 아니라 `(company_id, business_number)`를 핵심 키로 삼는다. 그래야 재수집, 가져오기, 리드 병합, 거래처 중복 병합 뒤에도 같은 회사 안에서 판정이 유지된다.

- 사업자번호는 숫자 10자리로 정규화하고 애플리케이션에서 기존 `normalizeBusinessNumber`와 `isValidBusinessRegistrationNumber`를 모두 통과시킨다.
- 한 회사에는 같은 번호의 활성 행을 하나만 허용한다. 다른 회사에는 같은 번호를 독립적으로 등록할 수 있다.
- 해제는 삭제가 아니라 `revoked_at/by` 기록으로 남긴다.
- 고객/리드 FK를 두지 않는다. 원본 고객이 삭제·병합돼도 회사 내부 거래 금지 결정이 사라지지 않아야 한다.
- `reason_code`는 제한된 코드로 저장하고, 자유 입력은 `memo`에 둔다.
- 공개 스키마 테이블은 RLS를 켜고 `anon`, `authenticated` 직접 권한을 회수한다. 서버의 검증된 경로만 사용한다.

검토용 SQL은 `docs/sql-drafts/20261027-K-company-trade-blocks.sql`에 분리한다.

## 승인 후 애플리케이션 함수 경계

승인 이후에도 아래처럼 한 서비스 경계를 두고 기존 함수에 산발적인 쿼리를 복사하지 않는다.

- `listCompanyTradeBlocks(companyId)` — 대표·관리자용 목록
- `getActiveCompanyTradeBlock(companyId, businessNumber)` — 서버 내부 단건 판정
- `activateCompanyTradeBlock(companyId, input, actor)` — 정규화·체크섬·역할 검증 후 등록
- `revokeCompanyTradeBlock(companyId, id, actor)` — 물리 삭제 없이 해제

후속 연결은 별도 승인·PR로 진행한다.

1. `ingestPermitLeadRows`: 활성 번호와 일치한 신규/갱신 리드에 경고·제외를 멱등 적용하고 리드 행동/공통 수정 기록을 남긴다.
2. `listPermitLeads`: 기존 데이터가 아직 갱신되지 않았더라도 활성 번호를 기준으로 경고를 계산한다.
3. `updatePermitLeadProfile`: 번호 변경 후 재판정한다.
4. `convertPermitLeadToCustomer`: 활성 거래 금지 번호의 전환을 서버에서 막거나 대표 재확인을 요구한다.
5. `upsertCustomerMaster`: 기존 고객을 삭제하지 않고 경고만 반환한다. 자동 거래종료·자동 병합은 하지 않는다.

## 자동 제외 전에 결정할 사항

1. 자동 제외가 `business_permit_leads.status/exclude_reason`을 실제 변경할지, 목록 조회 시 계산된 상태로만 표시할지
2. 이미 거래 중인 고객을 거래 금지로 등록할 때 경고만 할지, 주문·견적 생성도 막을지
3. 해제 시 과거에 자동 제외된 리드를 원래 상태로 복구할지, 담당자 검토 큐로 보낼지
4. 사유 코드 확정 및 메모에 개인정보·민감정보를 적지 않도록 하는 운영 문구
5. 보존기간, 해제 이력 보관기간, 대표·관리자 감사 화면

승인 전에는 기존 고객 삭제, `relationship_status` 자동 변경, 리드 자동 제외, 거래처 전환 차단을 구현하지 않는다.

