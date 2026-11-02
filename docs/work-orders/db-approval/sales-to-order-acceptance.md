# S-2 영업 → 주문 수락 DB 승인 초안

> 상태: **승인 전 · 운영 실행 금지**  
> 운영 프로젝트 `fcmdvveqmcgtioelzqun`에는 `DB-APPROVED:` 명시 승인 전 어떤 SQL도 실행하지 않는다.  
> 소유: 03 거래처·원장. 중앙 `db-approval-queue.md`에는 이 문서 링크만 추가하며, 이 문서의 상세 내용은 다른 방이 수정하지 않는다.

## 목적과 범위

`pricing_documents(kind in ('sheet','quote'))`의 게시 버전을 매장 또는 직원이 수락했을 때 아래를 한 트랜잭션으로 처리한다.

1. 단가표·견적 문서와 게시 버전, 회사, 리드·거래처 연결을 검증한다.
2. 기존 거래처를 연결하거나 리드를 거래처로 전환한다.
3. 문서를 수락 상태로 바꾸고 수락 주체·시각을 기록한다.
4. 단가표는 매장에 가격 우선순위 2로 연결하고 협의 단가는 만들지 않는다.
5. 견적은 매장에 가격 우선순위 1로 연결하고 게시 버전의 품목·가격으로 우선순위 0 `customer_price_agreements`를 생성한다.
6. 같은 요청 재시도에는 같은 결과를 반환한다.
7. 첫 주문 또는 수락 과정에서 받은 최소 배송 정보를 거래처의 빈 칸에만 보완한다.

제외: 선결제, PG, 2% 수금·정산, 실제 다중 유통사 연결, WO-17/19, 기존 리드 점수 재계산, 운영 기능 활성화.

## 현재 상태

- `pricing_documents`와 `pricing_document_versions`는 운영 적용 기록이 있으며 회사 복합 키를 사용한다. 공용 단가표와 매장별 견적이 같은 테이블에서 `kind`로 나뉜다.
- 게시 버전은 불변이다. 수락 가격의 근거는 편집 중 문서가 아니라 정확한 `pricing_document_versions.id`여야 한다.
- 운영 중인 `customer_price_agreements`는 기존 `sales_quotes` 출처만 지원한다. 이 경로는 삭제하거나 의미를 바꾸지 않는다.
- 기존 `sales_quotes` 수락과 리드 전환 후 가격 반영은 여러 호출로 나뉜다. 새 S-2 수락에는 재사용하지 않고 기존 흐름을 보존한다.
- `QUOTE_ACCEPTANCE`는 기본 OFF로 추가하고, 승인·배포 확인 전 활성화하지 않는다.

## 제안 객체

### 1. `pricing_documents` 확장

| 칸 | 용도 |
|---|---|
| `lead_id uuid` | 단가표를 보낸 대상 또는 견적의 원 리드. `(company_id, lead_id)` 복합 FK |
| `customer_id uuid` | 연결·전환된 거래처. `(company_id, customer_id)` 복합 FK |
| `acceptance_status text` | `draft/published/sent/viewed/accepted/expired/cancelled` |
| `accepted_version_id uuid` | 실제 수락한 게시 버전의 회사 복합 FK |
| `accepted_at timestamptz` | 최초 수락 시각 |
| `accepted_via text` | `store/staff` |
| `accepted_by_key text` | 서버에서 정규화한 행위자 식별값. 공개 토큰 원문은 저장하지 않음 |

`quote`와 한 매장 전용 `sheet`는 문서 수락 칸을 사용할 수 있다. `accepted` 뒤에는 수락 버전과 연결 거래처를 바꾸지 않는다. 공용 단가표는 여러 매장이 수락할 수 있으므로 원본 문서 전체를 `accepted`로 바꾸거나 단일 `customer_id`에 묶지 않는다. 공용 단가표의 대상별 `lead_id`·수락 상태는 아래 보낸 기록과 수락 요청 행에 둔다.

### 2. `pricing_document_sends`

단가표·견적을 리드에게 보낸 기록을 문서와 분리해 append-only로 남긴다.

| 칸·제약 | 내용 |
|---|---|
| `company_id`, `id` | 회사 격리 복합 키 |
| `lead_id`, `document_id`, `document_version_id` | 모두 회사 복합 FK |
| `document_kind` | `sheet/quote`, 실제 문서 kind와 일치해야 함 |
| `channel` | `link/kakao/qr/print/staff` |
| `sent_by_key`, `sent_at` | 보낸 사람과 시각 |
| `acceptance_status` | 대상별 `sent/viewed/accepted/expired/cancelled` |
| `viewed_at`, `accepted_at`, `customer_id` | 대상별 열람·수락 결과, 모두 회사 범위 |
| `idempotency_key uuid` | `unique(company_id, idempotency_key)` |

리드 표시 링크는 이 행의 ID를 서명된 링크 컨텍스트에 포함하고, 수락 RPC는 서버가 검증한 send ID로 리드를 즉시 연결한다. 토큰 원문은 저장하지 않는다.

### 3. `pricing_document_acceptance_requests`

| 칸·제약 | 내용 |
|---|---|
| `company_id`, `id` | 회사 격리 복합 키 |
| `idempotency_key uuid` | `unique(company_id, idempotency_key)` |
| `request_fingerprint text` | 같은 키에 다른 입력이 오면 충돌 |
| `document_id`, `document_version_id` | 회사 복합 FK |
| `lead_id`, `customer_id` | 회사 복합 FK |
| `send_id` | 선택한 보낸 기록의 회사 복합 FK |
| `document_kind`, `accepted_via`, `result jsonb`, `created_at` | 분기·재시도 결과 반환과 감사 |

직접 테이블 접근은 차단하고 service role만 사용한다.

### 4. `customer_pricing_document_links`

수락한 매장과 정확한 게시 버전의 가격 연결을 보존한다.

- `(company_id, customer_id, document_kind)`별 활성 연결은 하나다.
- `sheet`는 가격 우선순위 2, `quote`는 우선순위 1이다.
- 문서와 버전, 거래처는 모두 회사 복합 FK로 묶는다.
- 새 수락 시 같은 kind의 기존 활성 연결을 종료하고 새 버전을 연결한다.
- 단가표 수락은 이 연결만 만들고 `customer_price_agreements`를 만들거나 종료하지 않는다.

### 5. `customer_price_agreements` 확장

- `source_pricing_document_version_id uuid`를 추가하고 `(company_id, source_pricing_document_version_id)` 복합 FK로 연결한다.
- 기존 `source_quote_id`·`source_quote_item_id`는 레거시 `sales_quotes` 호환을 위해 유지한다.
- 새 `quote` 수락으로 생성한 행은 `source_pricing_document_version_id`를 반드시 가진다. `sheet` 수락은 이 테이블을 변경하지 않는다.
- 동일 거래처·상품·단위의 활성 기간 중복을 허용하지 않는다.
- 기존 계약을 종료하고 새 계약을 만드는 과정은 수락 RPC 안에서만 수행한다.

### 6. 공용 단가표 수락의 리드 연결

- 서명 링크에 검증된 `pricing_document_sends.id`가 있으면 그 행의 같은 회사 `lead_id`에 즉시 연결한다.
- send ID가 없는 공용 단가표는 매장명·연락처·주소를 필수로 받아 같은 회사 활성 리드를 찾는다.
- 매칭 순서는 정규화 전화번호 완전 일치, 그다음 정규화 매장명+주소 완전 일치다.
- 강한 후보가 하나면 연결한다. 후보가 여러 개면 임의 선택하지 않고 `Lead match ambiguous`로 전체 중단한다.
- 후보가 없으면 `source='pricing_sheet_acceptance'`인 신규 리드를 만들고 acceptance request와 연결한다.
- 멱등 요청 행 잠금 안에서 매칭·생성을 수행해 재시도나 동시 수락이 신규 리드를 중복 생성하지 않게 한다.

### 7. A-2 거래처 기본정보

기존 칸을 우선 재사용한다.

- 배송지: `normalized_customers.address`
- 대표 연락처: `phone`
- 출입 방법: `access_method_type`, `access_note`
- 사업자번호: `business_registration_number`

필요한 신규 칸 후보:

- `delivery_recipient_name text`
- `delivery_contact_phone text`
- `preferred_delivery_time text`

수락·첫 주문 입력은 기존 값이 비어 있을 때만 자동 반영한다. 이미 저장된 운영자 값을 바꾸려면 별도 명시적 수정 요청이 필요하다. 사업자등록증 사진과 비밀금고 데이터는 받지 않는다.

## RPC 계약

### `accept_pricing_document`

입력:

- `p_company_id uuid`
- `p_document_id uuid`
- `p_document_version_id uuid`
- `p_idempotency_key uuid`
- `p_request_fingerprint text`
- `p_accepted_via text`
- `p_actor_key text`
- `p_send_id uuid default null`
- `p_customer_profile jsonb default '{}'`

서버가 인증·권한·서명 토큰을 확인한 뒤에만 호출한다. RPC는 다음 순서로 잠금·검증한다.

1. 멱등 요청 행 조회. 같은 지문이면 저장 결과 반환, 다른 지문이면 `Idempotency conflict`.
2. 회사 행, 문서, 게시 버전, 선택한 보낸 기록을 안정된 순서로 잠근다.
3. `kind in ('sheet','quote')`, 게시본, 유효기간, 문서와 버전의 회사·소유 관계를 검증한다.
4. 리드 표시 링크면 같은 회사 send 행의 리드를 사용한다. 공용 단가표면 입력 정보로 기존 리드를 매칭하고 없으면 신규 리드를 한 번만 만든다.
5. 연결된 기존 거래처 또는 같은 회사 리드를 검증한다.
6. 거래처 연결/전환 Use Case를 호출하고 회사 범위 고객 ID를 얻는다.
7. 거래처 기본정보의 빈 칸만 보완한다.
8. 게시본의 보이는 품목마다 상품 회사 FK·단위·과세·정수 가격을 검증한다.
9. `sheet`면 가격 우선순위 2 문서 연결만 만든다.
10. `quote`면 가격 우선순위 1 문서 연결을 만들고 기존 활성 협의 단가를 기간 종료한 뒤 우선순위 0 협의 단가를 추가한다.
11. `quote` 또는 한 매장 전용 `sheet`는 문서를 accepted로 바꾼다. 공용 `sheet`는 원본을 published로 유지하고 대상 send 행만 accepted로 바꾼다.
12. 멱등 결과를 저장한다.

중간 실패 시 리드 생성·거래처 전환, 문서 상태, 문서 연결, 협의 단가, 기본정보, 요청 기록을 모두 되돌린다.

## D-1 배송 연결 계약

첫 주문이 존재하고 `delivery_territory_id` 또는 `delivery_vehicle_id`가 비어 있는 거래처를 회사 범위 후보로 조회한다. 추천과 실제 배정은 분리한다.

`assign_customer_delivery_route`는 `company_id`, `customer_id`, `territory_id`, 선택 `vehicle_id`·`staff_member_id`, `idempotency_key`를 받고 모든 참조가 같은 회사인지 확인한다. 기존 배정을 덮어쓰는 요청에는 기대값 또는 명시적 재배정 사유가 필요하다. 이 문서는 계약만 정의하며 D-1 화면 구현과 실제 다중 유통사 연결은 포함하지 않는다.

## 권한 계약 — 07 전달 사항

07은 API 진입 전에 아래만 판정한다. 동일 API 파일을 03과 공동 수정하지 않는다.

- 직원 수락: 로그인 회사가 문서 회사와 같고 단가표·견적 수락 권한이 있어야 한다.
- 매장 수락: 서버가 검증한 서명 링크가 정확한 회사·문서·게시 버전을 가리켜야 한다.
- 리드 표시 send ID와 공용 단가표 매장 정보는 07이 신뢰하지 않고 서명·형식만 검증해 03 Use Case에 전달한다. 회사·리드 매칭은 03 RPC가 다시 검증한다.
- 비활성 회사, 만료·회수 링크, `QUOTE_ACCEPTANCE` OFF는 자료 조회 전에 404 처리한다.
- 공개 요청에서 `company_id`, `customer_id`, `lead_id`, 가격, 행위자 키를 신뢰하지 않는다.
- 07은 DB 함수나 `customer_price_agreements`를 수정하지 않고 권한 결과만 03 소유 Use Case에 전달한다.

## 접근 제어

- 신규 테이블 RLS 활성화.
- `public`, `anon`, `authenticated`의 테이블·함수 권한 회수.
- 서버 service role만 RPC 실행.
- 모든 FK는 `(company_id, id)` 복합 FK.
- 함수는 명시적 `search_path`, 회사 필터, 권한 확인 완료 표식을 요구한다.
- 운영 적용 전 `QUOTE_ACCEPTANCE=false`, `LEAD_SCORE_SETTINGS=false` 유지.

## PG17 승인 전 검증

- [ ] 다른 회사 문서·버전·리드·거래처·상품 참조 거부
- [ ] 같은 멱등 키·같은 입력은 동일 결과, 행·계약 중복 없음
- [ ] 같은 멱등 키·다른 입력은 충돌
- [ ] 병렬 수락 두 건 중 결과는 하나
- [ ] 리드 표시 단가표 수락은 표시된 같은 회사 리드에 즉시 연결
- [ ] 공용 단가표 수락의 전화번호 또는 매장명+주소 단일 후보 매칭
- [ ] 공용 단가표 매칭 후보가 없으면 신규 리드 하나만 생성
- [ ] 공용 단가표 다중 후보는 임의 연결 없이 전체 롤백
- [ ] 단가표 수락은 우선순위 2 문서 연결만 만들고 협의 단가를 만들지 않음
- [ ] 견적 수락은 우선순위 1 문서 연결과 우선순위 0 협의 단가를 함께 생성
- [ ] 단가표 보낸 기록은 리드·게시 버전·행위자·채널을 회사 범위로 보존
- [ ] 게시 버전 가격 스냅샷 그대로 계약 단가 생성
- [ ] 기준가·문서 초안 변경이 이미 수락한 계약 단가를 바꾸지 않음
- [ ] 기존 활성 계약 기간을 안전하게 종료하고 기간 중복 없음
- [ ] 연결되지 않은 상품·과세 미확정·잘못된 단위는 전체 롤백
- [ ] 기존 거래처 정보 비덮어쓰기와 빈 칸 보완
- [ ] 기존 `sales_quotes` 수락·출처 FK 회귀 없음
- [ ] `anon/authenticated` 직접 접근 및 RPC 실행 거부
- [ ] down SQL은 신규 수락 이력이 있으면 파괴적 제거 거부

## 예상 적용·복구

| 항목 | 내용 |
|---|---|
| 기존 데이터 영향 | 백필 없음. 기존 가격 문서·계약 단가·레거시 견적 변경 없음. 새 단가표·견적 수락부터 연결·기록 |
| 예상 적용 | 승인 후 단일 트랜잭션, 수 분 이내 추정. 실측 전 |
| 실패 시 | 트랜잭션 롤백, `QUOTE_ACCEPTANCE` OFF 유지 |
| 사용 후 복구 | 플래그 OFF. 수락·계약 이력 보존 후 수정 SQL로 복구 |
| down | 합성 PG17에서만 검증. 운영 데이터 생성 후 파괴적 down 금지 |

## 선행 조건과 책임 분리

- M-1 서버 기준 재계산 결과와 S-1 화면 점검 결과를 최신 main에서 확인한 뒤 SQL·코드를 작성한다.
- 03: 이 문서, SQL/down, PG17, 수락 RPC·도메인·애플리케이션 Use Case, `customer_price_agreements`.
- 09: `pricing_documents`·공유 링크·첫 주문 화면과 API 연결. SQL 제안은 03에 전달.
- 07: 인증·권한 판정. DB·협의 단가·수락 RPC는 수정하지 않음.
- `lib/store.ts` 변경이 불가피하면 호출 연결 한 줄만 허용하고 새 로직은 `domains/`·`application/`에 둔다.

## 승인

- Claude 검토: 대기
- 대표 승인: 대기
- `DB-APPROVED:` **없음**

