# CX-02 대표 회사 첫 주문 시험 준비 패킷

작성일: 2026-11-10  
범위: 대표 회사의 전용 시험 매장 1곳, 실제 실행은 대표가 한다. 이 문서는 운영 DB 쓰기·플래그 변경·배포를 승인하지 않는다.

## 성공 기준

한 점주 계정으로 다음 순서를 끊김 없이 확인한다.

1. 게시 중인 견적서 또는 단가표의 공개 링크를 연다.
2. `주문·점주 가입 시작` → `카카오로 점주 가입` → 매장 정보 확인을 완료한다.
3. 카카오 주소 검색에서 **서울특별시 송파구의 시험 주소**와 필수 상세주소를 저장한다.
4. 같은 게시 문서의 주문 화면에서 권역 안 배송일로 품목 1개를 후결제 주문한다.
5. `주문을 받았습니다. 주문 내역에서 확인해 주세요.`를 확인하고 `내역` 탭에서 주문 1건을 확인한다.
6. 상단 `배송지 주소 확인·수정`에서 회사 권역 밖의 별도 시험 주소를 저장한 뒤, 같은 링크의 주문 제출이 차단되는지 확인한다.
7. 시험을 끝낸 뒤 권역 안 시험 주소로 복원하고 링크를 회수한다. 주문은 삭제하지 않고 회사 화면에서 시험 주문임을 확인한 뒤 정상 취소 절차를 사용한다.

권역 안 1건과 권역 밖 차단은 **같은 점주·매장·게시 버전**으로 확인한다. 실제 고객, 실제 고객 주소, 개인 전화번호를 사용하거나 화면 캡처·문서·PR에 토큰과 개인정보를 남기지 않는다.

## 1. 실행 전 읽기 확인

### 배포와 플래그

Vercel Production의 현재 배포가 시험 대상으로 승인된 `main` 커밋인지 먼저 확인한다. 환경 변수 화면에서는 아래 **이름의 존재와 대상 회사 포함 여부만** 확인하고 값·회사 ID·비밀값을 복사하거나 기록하지 않는다.

| 묶음 | 모두 확인할 이름 | 통과 조건 |
| --- | --- | --- |
| 가격·주문 기본 | `PRICE_SHEETS_ENABLED`, `FEATURE_PRICING_COMPANY_IDS`, `STORE_ORDERING_ENABLED`, `FEATURE_STORE_ORDERING_COMPANY_IDS` | 전역 스위치 ON, 대표 회사만 허용 |
| 문서 공유·공개 진입 | `LEAD_DOCUMENT_SHARING_ENABLED`, `LEAD_DOCUMENT_SHARING_COMPANY_IDS`, `PUBLIC_DOCUMENT_ORDER_ENTRY_ENABLED` | 게시 문서의 공개 링크 발급과 주문 진입 가능 |
| 점주 가입·회원 | `STORE_PUBLIC_OWNER_ONBOARDING_ENABLED`, `FEATURE_STORE_PUBLIC_OWNER_ONBOARDING_COMPANY_IDS`, `STORE_MEMBER_SESSION_ENABLED`, `FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS` | 대표 회사만 가입·회원 세션 허용 |
| 주소 저장·수정 | `STORE_PUBLIC_OWNER_BASE_ADDRESS_ENABLED`, `FEATURE_STORE_PUBLIC_OWNER_BASE_ADDRESS_COMPANY_IDS`, `STORE_MEMBER_ADDRESS_ENABLED`, `FEATURE_STORE_MEMBER_ADDRESS_COMPANY_IDS` | 기본주소/상세주소 분리 저장 및 기존 점주 수정 가능 |
| 권역 연결·주문 검증 | `STORE_PUBLIC_OWNER_DELIVERY_ENABLED`, `FEATURE_STORE_PUBLIC_OWNER_DELIVERY_COMPANY_IDS`, `STORE_ORDER_ADDRESS_VERIFICATION_ENABLED`, `FEATURE_STORE_ORDER_ADDRESS_VERIFICATION_COMPANY_IDS` | 가입 시 단일 권역 연결, 주문 직전 주소·권역·요일 재검증 |
| 서버 필수 설정 | `STORE_PUBLIC_BASE_URL`, `STORE_LINK_SECRET`, `STORE_OWNER_ONBOARDING_SECRET` | URL 유효, 두 secret은 설정됨(값과 길이 출력 금지) |

사업자번호가 없는 개업 준비 매장으로 시험할 때만 `STORE_PREOPENING_ENABLED`와 `FEATURE_PREOPENING_COMPANY_IDS`도 확인한다. 이번 시험에 사업자번호가 있으면 이 묶음은 사용하지 않는다.

읽기 확인 방법:

1. Vercel → 프로젝트 → Settings → Environment Variables → Production에서 이름을 검색한다.
2. 전역 스위치는 ON/OFF만, allowlist는 “대표 회사 포함/미포함”만 기록한다. 실제 값은 기록하지 않는다.
3. 마지막 변경 뒤 Production 재배포가 완료되지 않았으면 시험하지 않는다.
4. 공개 링크에서 `주문 연결 준비 중`이 보이면 플래그를 임의로 더 켜지 말고 위 묶음과 배포 커밋을 다시 확인한다.

### 개인정보 없는 DB 읽기

아래 쿼리는 Supabase SQL Editor에서 **읽기 전용으로만** 실행한다. `:company_id`, `:store_account_id`, `:document_version_id`, `:trial_started_at`은 실행 화면에서만 치환하고 결과를 문서·채팅에 붙이지 않는다. 이름·주소·전화·사업자번호·토큰·카카오 식별자는 조회하지 않는다.

```sql
-- 1) 송파구가 활성 권역 정확히 1곳에만 포함되고, 그 권역의 배송 요일이 있는지
select
  count(distinct a.territory_id) as songpa_active_territory_count,
  count(r.territory_id) filter (
    where cardinality(coalesce(r.delivery_weekdays, '{}'::int[])) > 0
  ) as territory_rule_count
from public.delivery_territory_areas a
join public.delivery_territories t
  on t.company_id = a.company_id and t.id = a.territory_id and t.is_active
left join public.store_order_territory_rules r
  on r.company_id = a.company_id and r.territory_id = a.territory_id
where a.company_id = :company_id
  and a.administrative_area = '서울특별시 송파구';

-- 기대: songpa_active_territory_count=1, territory_rule_count=1

-- 2) 시험 게시 버전이 현재 주문 가능한 상태인지(내용·품목·거래처 정보는 조회하지 않음)
select
  count(*) as published_version_count,
  bool_and(coalesce((content->>'validUntil')::date >= current_date, false)) as validity_ok
from public.pricing_document_versions
where company_id = :company_id
  and id = :document_version_id;

-- 기대: published_version_count=1, validity_ok=true

-- 3) 가입 직후 매장/회원/주소·권역 연결 여부(값 자체는 출력하지 않음)
select
  count(distinct s.id) as active_store_count,
  count(distinct m.id) filter (where m.status = 'active' and m.role = 'owner') as active_owner_count,
  bool_and(c.delivery_base_address is not null and c.delivery_address_detail is not null) as split_address_ready,
  bool_and(c.delivery_territory_id is not null) as territory_link_ready
from public.store_accounts s
join public.store_account_members m
  on m.company_id = s.company_id and m.store_account_id = s.id
join public.normalized_customers c
  on c.company_id = s.company_id and c.id = s.customer_id
where s.company_id = :company_id and s.id = :store_account_id and s.status = 'active';

-- 기대: active_store_count=1, active_owner_count=1, split_address_ready=true,
--       송파구 주소 저장 뒤 territory_link_ready=true

-- 4) 시험 시작 뒤 주문 수와 최신 상태만 확인(주문 ID·메모·품목·금액 미조회)
select status, count(*) as order_count
from public.store_orders
where company_id = :company_id
  and store_account_id = :store_account_id
  and submitted_at >= :trial_started_at
group by status
order by status;

-- 기대: 권역 안 제출 뒤 submitted 1건. 권역 밖 시도 뒤 총 주문 수가 늘지 않음.
```

송파구 권역이 0개 또는 2개 이상이거나 요일 규칙이 없으면 시험을 중단한다. 시험 중 권역·요일·거래처를 SQL로 수정하지 않는다.

## 2. 시험 링크 발급

1. 회사 화면 → `/revenue/pricing/documents` → `견적서·단가표`에서 유효기간이 남은 게시 문서를 연다.
2. `주문 링크 QR 만들기` → `공개 링크·QR 생성`을 누른다.
3. `거래처 선택 없이 공개 링크를 만들었습니다` 안내와 `공개 문서 열기`를 확인한다.
4. `공개 링크 복사`로 시험 기기에만 전달한다. URL fragment의 토큰을 문서·채팅·스크린샷에 남기지 않는다.

기존 거래처 전용 QR은 첫 공개 가입 시험에 사용하지 않는다. 링크 발급 시 오류가 나면 반복 생성으로 우회하지 말고 같은 버튼의 재시도 안내와 게시 상태·유효기간·플래그를 확인한다.

## 3. 단계별 시험표

| 단계 | 대표가 하는 일 | 기대 화면 | 실패 시 중단 기준 |
| --- | --- | --- | --- |
| 공개 문서 | 비로그인 브라우저에서 링크 열기 | 문서 내용과 `주문·점주 가입 시작` | `주문 연결 준비 중`, 기간 종료, 404이면 배포·플래그·게시 버전 확인 |
| 카카오 가입 | 버튼 → `카카오로 점주 가입`, 본인 카카오 인증 | 인증 뒤 `점주 계정 시작`, 약관·매장 정보 확인 | `점주 개통은 아직 준비 중`, `store_activation_required`, 로그인 실패면 새 계정을 임의 생성하지 말고 원 링크에서 재시도 |
| 송파구 주소 | 카카오 검색 결과에서 송파구 기본주소 선택, 상세주소 필수 입력 | `카카오 주소를 선택했습니다`, 개통 뒤 원 문서 복귀 | 직접 입력 문자열로 우회 금지. `delivery_area_unavailable`이면 송파구 단일 권역·요일 읽기 확인 |
| 로그인 반영 | 원 주문 탭에서 `로그인 상태 다시 확인` | 매장 회원 주문 화면과 저장 배송지 표시 | 다른 회사·매장, 구성원 권한 오류면 중단 |
| 권역 안 주문 | `주문` 탭 → 표시된 가능 요일의 배송일 → 품목 1개 → `후결제로 주문 신청` | `등록한 매장 주소로 배송할 수 있습니다`, 가능 요일, 제출 뒤 `주문을 받았습니다. 주문 내역에서 확인해 주세요.` | 주소·권역·요일·마감·최소금액 안내를 우회하지 않음 |
| 내역 | `내역` 탭 | 방금 주문 1건, 주문일·배송일·상태·품목 표시 | 화면 재확인 후에도 없으면 재주문하지 말고 DB 읽기 4번으로 저장 여부 확인 |
| 권역 밖 차단 | `/store` 상단 `배송지 주소 확인·수정`에서 권역 밖 시험 주소 선택·상세주소 저장 후 원 주문 링크 새로고침 | `등록한 매장 주소는 이 회사의 배송 권역 밖입니다. 담당자에게 배송 가능 여부를 문의해 주세요.`, 제출 버튼 비활성 | 새 주문 행이 생기면 즉시 시험 중단·링크 회수·보고 |

다음 안내도 안전 차단이다. 억지로 진행하지 않는다.

- `주소가 여러 배송 권역과 겹칩니다...` → 중복 권역 설정 검토
- `주소에 맞는 배송 권역은 있지만 매장의 권역 연결이 완료되지 않았습니다...` → 거래처 권역 연결 검토
- `배송 권역의 가능 요일이 설정되지 않았습니다...` → 권역 요일 설정 검토
- `배송 가능 여부를 확인하지 못했습니다...` → 조회/배포 상태 확인

권역 밖 차단 확인은 주문 버튼을 활성화시키거나 API를 직접 호출하는 시험이 아니다. 화면 차단과 주문 건수 불변만 확인한다.

## 4. 시험 종료와 되돌리기

1. 권역 밖 시험 뒤 `배송지 주소 확인·수정`에서 원래 사용한 송파구 시험 주소와 상세주소를 다시 선택·저장한다.
2. DB 읽기 3번으로 분리 주소와 권역 연결이 다시 준비됐는지만 확인한다. 주소 값 자체는 조회·기록하지 않는다.
3. 문서 화면에서 `공개 링크 회수`를 누르고 `공개 링크를 회수했습니다. 인쇄된 QR도 열리지 않습니다.`를 확인한다.
4. 회사 주문 화면에서 시험 주문 1건을 찾아 정상 취소한다. DB에서 주문·매장·회원·거래처 행을 직접 삭제하지 않는다.
5. 대표 회사 시험을 위해 일시 활성화한 플래그가 있다면 승인자가 기존 상태로 복원하고 재배포한다. allowlist를 전 회사로 넓히지 않는다.
6. 카카오 연결·매장 계정 폐기가 필요하면 별도 승인 작업으로 남긴다. 이 시험에서 운영 계정이나 감사 기록을 임의 삭제하지 않는다.

즉시 중단 순서는 **공개 링크 회수 → 공개 주문/가입 회사 allowlist OFF 복원 → 승인된 이전 배포로 복귀**다. 이미 접수된 주문과 생성된 매장 계정은 보존하고 별도 검토한다.

## 5. 결과 기록 양식

값·토큰·주소·전화·상호·사업자번호 없이 아래만 기록한다.

| 확인 | 결과 |
| --- | --- |
| Production 커밋 | 승인된 커밋 / 불일치 |
| 필수 플래그 | 모두 확인 / 누락 이름만 기록 |
| 공개 링크 | 발급·회수 성공 / 실패 단계 |
| 카카오 가입 | 성공 / 실패 화면 문구 |
| 송파구 권역 | 단일 권역·요일·연결 확인 / 중단 사유 |
| 권역 안 주문 | 1건 접수·내역 확인 / 실패 단계 |
| 권역 밖 | 화면 차단·주문 수 불변 / 이상 발생 |
| 복원 | 송파구 주소·권역 연결 복원 / 후속 필요 |

CI·PG17·HTTP 200은 이 운영 시험의 대체 증거가 아니다. 위 화면 흐름과 개인정보 없는 읽기 결과를 대표가 확인해야 첫 주문 시험 완료로 기록한다.

## CX-07 회원·권한 검토 전달

CX-07 코드 소유 파일은 수정하지 않는다. 09방에는 다음 계약만 확인 요청한다.

- 공개 링크 열람만으로 회원 권한을 만들지 않는다. 카카오 가입 완료 후 active owner membership이 있어야 한다.
- 회사·매장·거래처·role은 브라우저 입력을 신뢰하지 않고 서명 링크와 매장 세션에서 서버가 다시 확정한다.
- 가입 출처 문서의 홈 연결은 같은 회사·매장에만 보이고, 회수·만료를 존중하며 중복 링크를 만들지 않는다.
- 권역 밖 차단과 회원 주문은 기존 09 주문 직전 주소·권역·요일 검증을 우회하지 않는다.
