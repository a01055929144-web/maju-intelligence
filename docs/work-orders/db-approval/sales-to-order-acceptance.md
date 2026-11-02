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
8. 수락한 게시 버전과 거래처를 기존 P2 주문 링크에 한 번만 연결하고 첫 주문까지 같은 회사·가격 출처를 보존한다.
9. 매장 계정과 점주·직원 구성원을 거래처에 회사 범위로 연결하고, 주문마다 실제 주문자를 감사 가능하게 남긴다.

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
| `lead_id` 또는 `customer_id`, `document_id`, `document_version_id` | 대상은 정확히 하나만 허용하고 모두 회사 복합 FK |
| `template_id`, `layout` | 실제 전송 템플릿과 `auto/table/cards` 레이아웃을 감사 가능하게 보존 |
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
- 강한 후보가 하나면 연결한다. 후보가 여러 개면 임의 리드를 선택하지 않되, 서버가 확인한 거래처로 수락·주문 흐름은 계속 진행하고 요청에 `needs_review=true`, `review_reason='ambiguous_lead_match'`를 남긴다.
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
- `delivery_drop_location text`

수락·첫 주문 입력은 기존 값이 비어 있을 때만 자동 반영한다. 이미 저장된 운영자 값을 바꾸려면 별도 명시적 수정 요청이 필요하다. 사업자등록증 사진과 비밀금고 데이터는 받지 않는다.

### 8. `store_accounts` — 매장 계정

거래처 하나에 매장 계정 하나를 두고 회사 간 공유하지 않는다.

| 칸·제약 | 내용 |
|---|---|
| `company_id`, `id` | 회사 격리 복합 키 |
| `customer_id` | `(company_id, customer_id)` 복합 FK, `unique(company_id, customer_id)` |
| `business_registration_number` | 필수 사업자번호. 숫자 정규화 형식 검사 |
| `business_status`, `business_status_verified_at` | 국세청 상태 조회로 계속 사업자임을 확인한 결과와 시각 |
| `terms_version`, `terms_accepted_at` | 필수 가입 약관 동의 버전·시각 |
| `terms_accepted_by_member_id` | 최초 점주 구성원 회사 복합 FK. 초기 생성 순환은 deferrable FK 또는 생성 RPC 순서로 처리 |
| `status` | `pending/active/suspended/closed` |
| `created_at`, `updated_at` | 감사 시각 |

- 국세청 조회의 원문 응답이나 인증 비밀값은 저장하지 않고 판정·확인 시각·서버 요청 ID만 저장한다.
- 가입 RPC는 약관 미동의, 사업자번호 형식 오류, 계속 사업자 확인 실패를 모두 거부한다.
- 기존 거래처 사업자번호가 있으면 같은 값인지 확인하며 자동으로 다른 번호로 덮어쓰지 않는다.
- 실제 국세청 호출과 로그인 인증은 07 소유다. 03 RPC는 07이 서버에서 검증한 확인 결과를 다시 회사·거래처 범위로 저장한다.

### 9. `store_account_members` — 점주·직원 여러 명

| 칸·제약 | 내용 |
|---|---|
| `company_id`, `id`, `store_account_id` | 매장 계정 회사 복합 FK와 구성원 복합 고유키 |
| `auth_user_id` | 카카오/아이디 로그인 뒤 서버가 확인한 사용자 ID |
| `login_id_normalized` | 매장 로그인 아이디. 대소문자·공백 정규화 후 전역 또는 인증 영역 UNIQUE |
| `role` | `owner/staff` |
| `status` | `invited/active/removed` |
| `invited_by_member_id`, `invite_token_hash`, `invited_at`, `joined_at` | 직원 초대·가입 감사. 원시 초대 토큰은 저장하지 않음 |
| `removed_by_member_id`, `removed_at` | 내보내기 감사. 제거 후 즉시 접근 차단 |
| `last_ordered_at` | 고객사 거래처 상세의 마지막 주문자 표시 보조값 |

- 활성 점주는 매장 계정마다 정확히 한 명이다. 활성 직원은 여러 명일 수 있다.
- 직원 초대, 가입, 내보내기, 점주 이전은 각각 idempotency key를 받는 service-role RPC로만 처리한다.
- 직원 내보내기는 구성원 행을 삭제하지 않고 `removed`로 바꾼다. 과거 주문의 주문자 FK는 유지한다.
- 점주만 직원 초대·내보내기, 결제 방식·매장 기본정보 변경, 일반 점주 이전을 할 수 있다.
- 현재 점주 이전은 기존 점주와 새 점주 행을 한 트랜잭션에서 잠그고 역할을 맞바꾼다. 실패하면 기존 점주를 유지한다.
- 고객사 직원의 보조 점주 이전은 07이 회사 권한과 사업자번호 재확인을 통과시킨 경우만 허용한다.

### 10. 구성원 감사 이력

`store_account_member_events`를 append-only로 두고 `invite/join/remove/owner_transfer/assisted_owner_transfer`를 기록한다.

- 회사·매장 계정·대상 구성원은 복합 FK다.
- `actor_member_id` 또는 고객사 `actor_user_key` 중 행위 경로에 맞는 값만 허용한다.
- 점주 이전은 이전·새 점주 ID, 사유, 사업자번호 재확인 시각을 기록한다.
- 사용자 ID·아이디·카카오 식별자 변경과 내보내기는 과거 이벤트를 수정하지 않는다.

### 11. 수락 → 주문 링크 → 첫 주문

새 주문 정본이나 별도 주문 링크 테이블을 만들지 않고 운영 적용된 P2의 `storefront_links`, `store_orders`, `store_order_requests`를 재사용한다.

- 수락 RPC 결과에 `customer_id`, `document_version_id`, `document_kind`, `pricing_document_link_id`, `storefront_link_id`를 포함한다.
- 수락에 사용한 링크가 회사·거래처·게시 버전 복합 경계를 만족하면 같은 링크를 주문 가능 상태로 전환한다.
- 수락 링크를 재사용할 수 없으면 서버가 만든 토큰 해시로 기존 P2 발급 함수를 호출하되, acceptance request와 링크를 1:1로 연결해 같은 수락 재시도에 링크가 늘어나지 않게 한다.
- `storefront_links`에 선택 `acceptance_request_id` 회사 복합 FK를 추가하고 활성 행에 `unique(company_id, acceptance_request_id)`를 둔다.
- 원시 bearer token은 DB에 저장하지 않는다. 기존처럼 서버가 한 번만 전달하고 DB에는 nonce/hash만 둔다.
- 첫 주문은 기존 `place_store_order`와 `store_order_requests` 멱등 경계를 사용한다. 새 수락 RPC가 주문 행을 미리 만들지 않는다.
- `store_orders`에 `store_account_id`와 `ordered_by_member_id`를 추가한다. 둘은 같은 회사·매장 계정의 활성 구성원을 가리키는 복합 FK다.
- 신규 매장 계정 주문은 `ordered_by_member_id`가 필수다. 기존 주문은 백필하지 않고 null을 허용해 보존한다.
- 주문 요청이 끝나기 전에 구성원을 행 잠금하고 `active`인지 확인한다. 내보낸 직원의 새 주문은 거부하지만 과거 주문 감사는 유지한다.
- 주문 성공 시 구성원의 `last_ordered_at`을 같은 트랜잭션에서 갱신한다.
- 첫 주문 가격은 6절 단일 가격 결정 순서를 따라 agreement(0) → quote(1) → sheet(2) → base 순서로 해석하고 `store_order_lines.unit_price`에 스냅샷한다.
- 첫 주문 뒤 문서·협의 단가·기준 단가가 바뀌어도 이미 저장한 주문 줄 가격은 다시 계산하지 않는다.
- 단가표 수락은 agreement를 만들지 않으므로 sheet(2)가 적용되고, 견적 수락은 agreement(0)가 quote(1)보다 우선한다.
- A-2 입력은 첫 주문 트랜잭션 안에서 빈 거래처 칸만 보완한다. 주문 저장 실패 시 기본정보 보완도 롤백한다.
- 주문 조건이 없으면 링크 발급·주문 가능 전환을 중단하고 O-2 설정 필요 결과를 반환한다. 설정 화면과 안내는 09 소유다.

## RPC 계약

### `accept_pricing_document`

입력:

- `p_company_id uuid`
- `p_document_id uuid`
- `p_document_version_id uuid`
- `p_idempotency_key uuid`
- `p_request_fingerprint text`
- `p_accepted_via text` (`store/staff/kakao_start/kakao_login`)
- `p_actor_key text`
- `p_send_id uuid default null`
- `p_customer_profile jsonb default '{}'`

서버가 인증·권한·서명 토큰을 확인한 뒤에만 호출한다. RPC는 다음 순서로 잠금·검증한다.

1. 멱등 요청 행 조회. 같은 지문이면 저장 결과 반환, 다른 지문이면 `Idempotency conflict`.
2. 회사 행, 문서, 게시 버전, 선택한 보낸 기록을 안정된 순서로 잠근다.
3. `kind in ('sheet','quote')`, 게시본, 유효기간, 문서와 버전의 회사·소유 관계를 검증한다.
4. 리드 표시 링크면 같은 회사 send 행의 리드를 사용한다. 공용 단가표면 입력 정보로 기존 리드를 매칭하고 없으면 신규 리드를 한 번만 만든다. 다중 후보는 `needs_review`로 감사하고 수락 자체는 막지 않는다.
5. 연결된 기존 거래처 또는 같은 회사 리드를 검증한다.
6. 거래처 연결/전환 Use Case를 호출하고 회사 범위 고객 ID를 얻는다.
7. 거래처 기본정보의 빈 칸만 보완한다.
8. 게시본의 보이는 품목마다 상품 회사 FK·단위·과세·정수 가격을 검증한다.
9. `sheet`면 가격 우선순위 2 문서 연결만 만든다.
10. `quote`면 가격 우선순위 1 문서 연결을 만들고 기존 활성 협의 단가를 기간 종료한 뒤 우선순위 0 협의 단가를 추가한다.
11. `quote` 또는 한 매장 전용 `sheet`는 문서를 accepted로 바꾼다. 공용 `sheet`는 원본을 published로 유지하고 대상 send 행만 accepted로 바꾼다.
12. 주문 설정 존재를 확인하고 같은 acceptance request의 기존 주문 링크를 재사용하거나 링크를 하나만 연결한다.
13. 멱등 결과에 거래처·게시 버전·가격 연결·주문 링크 ID를 저장한다.

중간 실패 시 리드 생성·거래처 전환, 문서 상태, 문서 연결, 협의 단가, 기본정보, 요청 기록을 모두 되돌린다.

### 매장 계정 RPC 묶음

- `create_store_account`: 약관 동의·국세청 계속 사업자 확인 결과·매장 아이디를 받아 계정과 최초 점주를 원자 생성한다.
- `invite_store_account_member`: 점주가 직원 초대 행과 해시 토큰을 한 번만 만든다.
- `accept_store_account_invite`: 07이 확인한 카카오/아이디 사용자를 초대 구성원에 연결하고 active로 전환한다.
- `remove_store_account_member`: 점주가 직원을 removed로 바꾸고 이벤트를 남긴다.
- `transfer_store_account_owner`: 현재 점주가 활성 직원에게 점주 역할을 원자 이전한다.
- `assisted_transfer_store_account_owner`: 07이 고객사 권한·사업자번호 재확인을 검증한 뒤 점주를 이전하고 별도 감사 이벤트를 남긴다.

모든 RPC는 `company_id`, `idempotency_key`, `request_fingerprint`를 받고 같은 키·같은 입력에는 저장 결과를 반환하며 같은 키·다른 입력은 거부한다. 공개 입력의 회사·거래처·구성원·역할을 신뢰하지 않는다.

## D-1 배송 연결 계약

첫 주문이 존재하고 `delivery_territory_id` 또는 `delivery_vehicle_id`가 비어 있는 거래처를 회사 범위 후보로 조회한다. 추천과 실제 배정은 분리한다.

`assign_customer_delivery_route`는 `company_id`, `customer_id`, `territory_id`, 선택 `vehicle_id`·`staff_member_id`, `idempotency_key`를 받고 모든 참조가 같은 회사인지 확인한다. 기존 배정을 덮어쓰는 요청에는 기대값 또는 명시적 재배정 사유가 필요하다. 이 문서는 계약만 정의하며 D-1 화면 구현과 실제 다중 유통사 연결은 포함하지 않는다.

## 권한 계약 — 07 전달 사항

07은 API 진입 전에 아래만 판정한다. 동일 API 파일을 03과 공동 수정하지 않는다.

- 직원 수락: 로그인 회사가 문서 회사와 같고 단가표·견적 수락 권한이 있어야 한다.
- 매장 수락: 서버가 검증한 서명 링크가 정확한 회사·문서·게시 버전을 가리켜야 한다.
- 매장 가입: 약관 필수 동의, 국세청 계속 사업자 확인, 매장 아이디 중복 검사를 07이 수행한 뒤 검증 결과만 03 RPC에 전달한다.
- 매장 구성원: 점주만 초대·내보내기·일반 점주 이전·매장정보 변경을 할 수 있고 직원은 주문만 가능하다.
- 고객사 보조 점주 이전: 해당 회사의 승인된 직원 권한과 사업자번호 재확인을 모두 요구한다.
- 주문: 서명 링크의 매장 계정과 로그인 구성원이 일치하고 구성원 상태가 active여야 한다.
- 리드 표시 send ID와 공용 단가표 매장 정보는 07이 신뢰하지 않고 서명·형식만 검증해 03 Use Case에 전달한다. 회사·리드 매칭은 03 RPC가 다시 검증한다.
- 비활성 회사, 만료·회수 링크, `QUOTE_ACCEPTANCE` OFF는 자료 조회 전에 404 처리한다.
- 공개 요청에서 `company_id`, `customer_id`, `lead_id`, 가격, 행위자 키를 신뢰하지 않는다.
- 공개 수락 요청은 크기·형식 검증, 회사·경로·요청자 해시별 분당 제한, `allowed/rate_limited/invalid` 감사를 통과해야 한다.
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
- [ ] 공용 단가표 다중 후보는 임의 리드 연결 없이 `needs_review`로 남고 수락·주문은 계속 진행
- [ ] 카카오 시작·로그인 경로가 수락 주체로 기록되고 정상 수락 가능
- [ ] 전송 기록에 `template_id`, `layout`, 리드/거래처 정확히 하나가 보존
- [ ] 공개 요청 형식·크기 검증, 속도 제한, 허용·제한·거부 감사
- [ ] 단가표 수락은 우선순위 2 문서 연결만 만들고 협의 단가를 만들지 않음
- [ ] 견적 수락은 우선순위 1 문서 연결과 우선순위 0 협의 단가를 함께 생성
- [ ] 단가표 보낸 기록은 리드·게시 버전·행위자·채널을 회사 범위로 보존
- [ ] 수락 재시도·동시 실행에도 acceptance request당 주문 링크 하나
- [ ] 주문 설정이 없으면 링크 주문 활성화 없이 전체 수락 결과에 설정 필요 상태 반환
- [ ] 첫 주문 재시도에도 주문·요청 기록 하나
- [ ] 첫 주문 가격이 agreement(0) → quote(1) → sheet(2) → base 순서를 따름
- [ ] 수락 뒤 가격 원본 변경이 기존 주문 줄 스냅샷을 바꾸지 않음
- [ ] 첫 주문 실패 시 A-2 기본정보 보완도 롤백
- [ ] 거래처당 매장 계정 하나와 회사 간 계정·구성원 참조 거부
- [ ] 약관 미동의·사업자번호 형식 오류·국세청 계속 사업자 미확인은 가입 거부
- [ ] 매장 아이디 정규화 중복 거부, 원시 인증 비밀값 저장 없음
- [ ] 매장 계정당 활성 점주 정확히 한 명, 직원 여러 명 허용
- [ ] 직원 초대·가입·내보내기 재시도에도 결과 하나
- [ ] 내보낸 직원은 즉시 새 접근·주문 거부, 과거 주문 FK와 감사 이벤트 보존
- [ ] 점주 이전 동시 실행에도 점주 한 명, 실패 시 기존 점주 유지
- [ ] 고객사 보조 점주 이전은 사업자번호 재확인·행위자·사유 감사
- [ ] 주문의 `ordered_by_member_id`가 같은 회사·매장 계정 구성원만 참조
- [ ] 서로 다른 점주·직원이 주문해도 주문자별 감사와 마지막 주문자 조회 가능
- [ ] 게시 버전 가격 스냅샷 그대로 계약 단가 생성
- [ ] 기준가·문서 초안 변경이 이미 수락한 계약 단가를 바꾸지 않음
- [ ] 기존 활성 계약 기간을 안전하게 종료하고 기간 중복 없음
- [ ] 게시 시 연결되지 않은 상품·과세 미확정·잘못된 단위는 전체 롤백
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

## 승인 후 작성할 파일

- SQL 초안: `docs/sql-drafts/20261102-S2-sales-to-order-acceptance.sql`
- down 초안: `docs/sql-drafts/20261102-S2-sales-to-order-acceptance.down.sql`
- PG17 계약 테스트: `docs/sql-drafts/20261102-S2-sales-to-order-acceptance.pg17.test.sql`

세 파일은 Claude 검토와 대표 승인 전 운영에 실행하지 않는다. SQL 초안 작성 PR에서도 `DB-APPROVED:`가 없으면 합성 PostgreSQL 17에서만 검증한다.

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

