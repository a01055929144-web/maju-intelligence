# CX-122 고객사 외식업 확인·가격 공개 — DB 승인 대기

- 대상 프로젝트: `fcmdvveqmcgtioelzqun`
- 적용 SQL: `docs/sql-drafts/2026-11-18-CX-122-store-price-visibility.sql`
- 안전 down: `docs/sql-drafts/2026-11-18-CX-122-store-price-visibility.down.sql`
- SQL 기준 커밋: `f59d144a0cea3724952953668a8d30af0413f303`
- 승인 상태: **미승인 · 미적용**
- 기능 상태: 기본 OFF, 회사 allowlist 미승인

이 문서는 SQL 적용 권한을 부여하지 않는다. CX-126과 CX-120·123 선행 순서를 확인하고 대표가 프로젝트와 CX-122를 명시해 별도 승인한 뒤에만 up SQL을 한 번 적용한다.

## 적용 전 읽기 점검

1. `store_accounts`, `company_members`, `companies`가 존재한다.
2. `store_accounts(company_id,id)`와 `company_members(company_id,id)` 고유 키가 존재한다.
3. `price_visibility_status`와 `store_price_visibility_events`가 아직 없다.
4. `STORE_PRICE_VISIBILITY_ENABLED` 및 회사 allowlist는 OFF다.
5. #1073, #1114, CX-124의 운영 적용·병합 순서를 총괄방에서 다시 확인한다.

## 승인 범위

승인 문구는 아래 대상과 작업을 함께 명시해야 한다.

```text
fcmdvveqmcgtioelzqun CX-122 고객사 외식업 확인·가격 공개 SQL 승인
```

승인 범위는 up SQL 한 번뿐이다. 기능 ON, 회사 allowlist 추가, 실제 매장 확인·취소, 배포는 각각 별도 승인 대상이다.

## 적용 후 읽기 검증

- 모든 기존 매장은 `pending`이며 자동 가격 공개된 행이 0건이다.
- `store_price_visibility_events` RLS가 켜져 있고 anon/authenticated 직접 권한이 없다.
- 세 함수는 `service_role`만 실행 가능하다.
- owner/manager만 확인·취소할 수 있고 직원·다른 회사·개업 준비 매장은 거부된다.
- 확인 후에만 `store_price_visible_v1`이 true이고 취소 직후 false다.
- 참고 표시는 `reference_snapshot`에만 남으며 공개 판정을 자동으로 바꾸지 않는다.

## down 제한

확인 상태 또는 감사 이력이 하나라도 있으면 down은 거부된다. 기능 OFF와 확인·감사 0건을 읽기 확인하고 별도 복구 승인을 받은 경우에만 검토한다.

## 승인 준비 완료 기록 (2026-11-22 · Claude Code · 운영 읽기 전용)

- 기준 main `09b13f3`. SQL·down·PG17 시험은 #1125 병합(`c5b58fe`) 이후 **변경 없음**.
- SQL 파일 sha256(앞 16자): up `46fcaeb76d636128` · down `ce30dd2eedd9bd11`.
- 적용 전 읽기(운영 PostgreSQL 17.6): `store_accounts`·`company_members`·`companies` 존재, `store_accounts(company_id,id)`·`company_members(company_id,id)` 고유 키 존재, `price_visibility_status` 열·`store_price_visibility_events` 테이블·함수 3개 **없음**. 대상 `store_accounts` 1행.
- 선행: CX-124 11/21 적용 완료, CX-120·CX-123 11/22 적용 완료. 기능 스위치(`STORE_PRICE_VISIBILITY_ENABLED`·회사 목록)는 값을 읽지 않았고 코드 기본 OFF만 확인(적용 직전 Vercel 환경변수 이름 확인 필요).
- PG17: CI `ci.yml`의 `tests/sql/store-price-visibility-cx122.pg17.test.sql` 단계가 main CI에 포함돼 초록(최근 완료 main CI `16aaba9` 성공). 적용 직전 최신 main CI를 한 번 더 확인한다.
- 이 SQL은 기존 `store_accounts`에 열을 추가하고 기존 행을 `pending`으로 채운다(자동 공개 0건). 새 테이블·함수 3개는 service_role 전용.

**대표 승인 문구(그대로 답해 주세요):**

```text
fcmdvveqmcgtioelzqun CX-122 고객사 외식업 확인·가격 공개 SQL 승인
```

적용은 문구를 받은 쪽이 1회, 같은 트랜잭션에서 audit 기록, 위 "적용 후 읽기 검증" 실행. 재실행 금지.
