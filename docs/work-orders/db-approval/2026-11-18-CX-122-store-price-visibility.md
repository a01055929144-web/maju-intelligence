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
