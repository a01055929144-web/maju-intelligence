# 전환 전 리드 파일 저장 설계 초안

상태: **승인 전 설계안**. 이 문서는 SQL 마이그레이션이 아니며, 현재 운영 코드나 DB에 연결하지 않는다.

## 목적

거래처로 전환되지 않은 리드에도 간판 사진, 사업자등록증, 계약 전 참고자료를 보관하되 회사 경계와 담당자 접근 범위를 유지한다. 거래처 전환 후에는 기존 `customer_attachments` 권한·보존 체계로 안전하게 이관할 수 있어야 한다.

## 제안 구조

별도 `lead_attachments` 테이블을 두고 다음 필드를 최소 단위로 사용한다.

```sql
-- 검토용 초안. 승인 전 실행 금지.
create table public.lead_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  attachment_type text not null,
  title text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  migrated_customer_attachment_id uuid,
  deleted_at timestamptz,
  constraint lead_attachments_lead_company_fk
    foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id)
    on delete cascade,
  constraint lead_attachments_migrated_customer_company_fk
    foreign key (company_id, migrated_customer_attachment_id)
    references public.customer_attachments(company_id, id)
    on delete set null (migrated_customer_attachment_id)
);

create index idx_lead_attachments_lead_created
  on public.lead_attachments(company_id, lead_id, created_at desc)
  where deleted_at is null;
```

복합 FK의 선행 조건을 확인한 결과 `business_permit_leads(company_id, id)`에는 이미 `business_permit_leads_company_id_id_uq` UNIQUE 제약이 있다. 반면 `customer_attachments(company_id, id)`에는 현재 복합 UNIQUE가 없으므로, 실제 마이그레이션 승인 시 아래 제약을 먼저 추가해야 한다.

```sql
-- 검토용 선행 조건. 승인 전 실행 금지.
alter table public.customer_attachments
  add constraint customer_attachments_company_id_id_uq
  unique (company_id, id);
```

이 복합 FK들은 `company_id`와 대상 ID를 함께 검증하므로, 한 회사의 첨부 행이 다른 회사의 리드나 거래처 첨부를 참조하는 상태를 DB 수준에서 차단한다. 실제 마이그레이션에서는 동일 이름 제약의 존재 여부를 확인하는 재실행 안전 구문을 사용한다.

## 권한 원칙

- 모든 읽기·쓰기에서 인증 세션의 `company_id`와 리드의 `company_id`가 일치해야 한다.
- 관리자 또는 `manage_customers` 권한 보유자만 등록·삭제할 수 있다.
- 현장 사용자는 배정된 리드 범위가 정의되기 전까지 접근을 허용하지 않는다.
- 파일 URL을 DB에 공개 URL로 저장하지 않는다. `storage_path`만 저장하고, 열람 API가 권한을 다시 확인한 뒤 짧은 만료시간의 서명 URL을 발급한다.
- Storage 경로는 `company_id/leads/lead_id/random-file-id` 형태로 고정하고 사용자 파일명을 경로 권한 판단에 사용하지 않는다.

## 전환 및 보존 정책

- 거래처 전환 시 원본 파일을 공개하지 않고, 서버 트랜잭션/재시도 가능한 작업으로 `customer_attachments`에 복사 또는 참조 이관한다.
- 이관 성공 후 `migrated_customer_attachment_id`를 기록해 중복 이관을 막는다.
- 리드 병합 시 파일은 대표 리드로 자동 이동하지 않고 관리자 검토 큐에 둔다.
- 영업 제외 리드의 파일은 즉시 삭제하지 않고 합의된 보존기간 후 삭제한다. 보존기간과 법적 근거는 운영 승인에서 확정한다.
- 삭제는 DB soft delete → Storage 삭제 작업 → 감사 로그 기록 순으로 수행한다.

## 승인 전에 결정할 사항

1. 리드 파일의 보존기간과 영업 제외·중복 병합 시 처리 방식
2. 현장 사용자에게 리드 배정 개념과 열람 권한을 제공할지 여부
3. 거래처 전환 시 파일 복사와 동일 객체 참조 중 어떤 방식을 사용할지
4. 허용 파일 종류, 파일당 용량, 악성 파일 검사 정책
5. 감사 로그에 보관할 행위와 개인정보 최소화 기준

