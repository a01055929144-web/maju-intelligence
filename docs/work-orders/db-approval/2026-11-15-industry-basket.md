# 업종별 기본 품목·공유 링크 미리보기 — DB 승인 요청

## 상태와 범위

- SQL 초안 검토용이며 운영 DB에는 적용하지 않았다.
- up: `docs/sql-drafts/2026-11-15-industry-basket.sql`
- down: `docs/sql-drafts/2026-11-15-industry-basket.down.sql`
- PG17 시험: `docs/sql-drafts/2026-11-15-industry-basket.pg17.test.sql`
- 새 `company_industry_baskets` 테이블과 기존 `pricing_document_share_links`의 nullable 미리보기 3개 칸만 추가한다.
- 기존 공유 링크는 세 미리보기 칸이 모두 null로 남고, 바스켓 초기 데이터는 넣지 않는다.
- 앱 코드·기능 스위치·운영 배포는 별도 작업이다.

## 승인 질문

up 초안을 운영 DB에 한 번 적용해도 되는가?

- 한 트랜잭션이며 `lock_timeout = '3s'`, `statement_timeout = '20s'`를 사용한다.
- 업종은 한식·중식·일식·양식·분식·카페/디저트·주점·치킨/고깃집·기타만 허용한다.
- 회사·상품·수정 담당자를 복합 외래 키로 묶어 다른 회사 값을 참조할 수 없다.
- 바스켓은 RLS를 켜고 `service_role`만 읽기·쓰기가 가능하다. 브라우저 역할에는 권한과 정책을 주지 않는다.
- 공유 링크의 기존 RLS·권한은 바꾸지 않는다.
- `admin_audit_logs`에 스키마 추가 기록 1건을 남기며 실제 상호·품목·연락처는 기록하지 않는다.

## 적용 전 읽기 점검

```sql
select count(*) as existing_share_links
from public.pricing_document_share_links;

select to_regclass('public.company_industry_baskets') as basket_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pricing_document_share_links'
  and column_name in ('preview_id', 'preview_title', 'preview_description');

select relrowsecurity, relforcerowsecurity, relacl
from pg_class
where oid = 'public.pricing_document_share_links'::regclass;

select polname, polcmd, polroles, polqual, polwithcheck
from pg_policy
where polrelid = 'public.pricing_document_share_links'::regclass
order by polname;
```

바스켓 테이블은 null, 미리보기 칸 조회는 0행이어야 한다. 공유 링크 RLS·정책·권한 결과는 적용 후 비교용으로 보관한다.

## 적용 순서

1. 앱 배포와 관련 운영 쓰기를 중단하고 적용 전 읽기 결과를 기록한다.
2. 승인된 up 원문을 운영 DB에 한 번 실행한다. 재실행하지 않는다.
3. 아래 읽기 검증에서 기존 행 변경 0건, 회사 격리, RLS·권한, 감사 기록을 확인한다.
4. 바스켓 초기 품목 입력과 링크 미리보기 앱 기능은 별도 검토·배포 뒤에 시작한다.

## 적용 후 읽기 검증

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    table_name = 'company_industry_baskets'
    or (table_name = 'pricing_document_share_links'
        and column_name in ('preview_id', 'preview_title', 'preview_description'))
  )
order by table_name, ordinal_position;

select count(*) as basket_rows
from public.company_industry_baskets;

select count(*) as existing_share_links,
       count(*) filter (
         where num_nonnulls(preview_id, preview_title, preview_description) > 0
       ) as changed_existing_links
from public.pricing_document_share_links;

select relrowsecurity, relforcerowsecurity, relacl
from pg_class
where oid in (
  'public.company_industry_baskets'::regclass,
  'public.pricing_document_share_links'::regclass
)
order by relname;

select polname, polcmd, polroles, polqual, polwithcheck
from pg_policy
where polrelid in (
  'public.company_industry_baskets'::regclass,
  'public.pricing_document_share_links'::regclass
)
order by polrelid::regclass::text, polname;

select action, target_type, metadata, created_at
from public.admin_audit_logs
where action = 'industry_basket_schema_added'
order by created_at desc
limit 1;
```

`basket_rows = 0`, `changed_existing_links = 0`이어야 하며 공유 링크 RLS·정책·권한은 적용 전과 같아야 한다.

## down과 되돌리기 제약

- 후속 앱 기능을 먼저 끄고 앱을 이전 버전으로 되돌린 뒤 별도 승인을 받는다.
- 바스켓 행이 하나라도 있거나 공유 링크 미리보기 값이 하나라도 있으면 down은 의도적으로 실패한다.
- 값이 0건일 때만 down을 실행한다. down도 감사 기록을 남긴 뒤 새 테이블과 미리보기 칸을 제거한다.
- 데이터가 생긴 뒤에는 대상 회사·바스켓·공유 링크와 보존 위치를 읽기 확정한 수동 복구 계획이 필요하다.

## 화면 확인

- 변경 화면: 없음(SQL 초안·시험·승인표·생성 스키마 문서만).
- 실제 화면: 확인 못 함. 앱과 운영 DB는 이번 작업 범위가 아니다.
