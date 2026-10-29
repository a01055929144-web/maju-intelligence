# 가격표 ①-2 — P0

Owner Domain: pricing. Related: product (원장 매입가 읽기), organization (대표 권한/회사 격리).

## Allowed Files
- domains/pricing/*, application/pricing/*, lib/pricing/*
- app/api/price-sheets/route.ts, app/revenue/pricing/page.tsx
- components/price-sheets-workspace.tsx, tests/pricing-*.test.ts
- docs/sql-drafts/20261030-pricing-p0.sql, tests/sql/pricing-p0*.sql
- scripts/test-pricing-p0-local.mjs

## Scope / Preserve
마진 그룹·카테고리 연결, 회사 기본 마진·품목 마진·직접 단가, 원가 변동분 일괄 재계산, 직전 실행 복구를 구현한다.
매출총이익률 = (판매가 - 원가) / 판매가. 마진은 0~9999bp, 원 단위 정수 가격 상한 1조원.
가격 우선순위: 직접 단가(0원 포함) → 품목 마진(0% 포함) → 그룹 마진 → 회사 기본 마진 → 올림. 직접 단가는 올림하지 않는다. null/빈 값은 상속이며 0은 명시값이다. 원가 0원·비활성은 일괄 계산 제외.
그룹은 품목에 우선 지정한 그룹이 있으면 해당 그룹, 없으면 product_catalog.category와 정확히 일치하는 카테고리 연결로 결정한다. 카테고리 연결이 없으면 회사 기본 마진을 적용한다. 회사 설정 초기값은 0%, 10원 올림이다.
기존 견적/계약/상품 원장 판매가는 수정하지 않는다. P1~P3, 보류 메뉴 노출 금지.

## Activation
PRICE_SHEETS_ENABLED=false 기본. true + HOLD_MODULES_ENABLED_COMPANY_IDS 회사 허용 + 대표/관리자 권한이 모두 필요하다.
OFF 시 화면/API 404 및 신규 테이블 조회 없음. 메뉴 링크는 추가하지 않음.
운영 SQL 실행 금지. 적용 승인·스키마 확인 전 플래그 활성화 금지.

## Concurrency / recovery
회사 행 잠금으로 가격표 쓰기를 직렬화한다. 재계산 동안 상품 행 잠금으로 원가 변경과 계산의 시점을 일치시킨다.
중복 재계산은 변경분이 없으면 새 실행을 만들지 않는다. 복구는 마지막 실행만 가능하며 같은 복구 재시도는 성공한다.
품목 전체 스냅샷/수정 번호가 실행 직후와 다르면 전체 복구를 취소한다. 원가는 복구하지 않는다.
복구 후 다시 계산 필요 건수는 현재 원가·그룹 설정과 이전 계산 기준의 차이에서 산출한다.

## Source limitation
2026-10-29 Claude 설계/와이어프레임 링크는 웹 접근 불가. 사용자 명시 요구와 저장소 규칙 기준 구현.
원가 출처는 product_catalog.purchase_price. 공급처 원가 동기화는 기존 상품 원장 담당 범위이며 별도 변경하지 않는다.
'1조원'을 넘는 bigint는 JS 안전 범위 전에 명시적으로 거부한다.

## Local PG16 test
빈 pricing_p0_test* DB가 있는 폐기 가능한 loopback 전용 PG16 클러스터에서 PRICING_P0_LOCAL_DATABASE_URL을 지정하고 node scripts/test-pricing-p0-local.mjs 실행. 운영 환경변수 로딩 없음. fixture는 합성 데이터만 사용한다. 동시 세션 원가 변경/중복 재계산/중복 복구도 실행한다.
추가 Allowed Files: tests/sql/pricing-p0-fixture.sql, scripts/test-pricing-p0-concurrency.mjs, lib/pricing/feature.ts.

## SQL model / pagination
- 명세 테이블: margin_groups, margin_group_categories, price_recalc_runs, price_recalc_changes.
- 보조 테이블: pricing_items(품목 규칙/계산 기준/수정 번호), pricing_settings(회사 기본 마진/올림).
- 모든 회사 관계는 회사 ID 복합 FK로 격리하고, 신규 테이블과 security_invoker 뷰는 anon/authenticated 직접 접근을 차단한다.
- pricing_p0_effective는 품목/카테고리/기본 마진을 한 곳에서 해석해 SQL 목록·전체 필요 건수·재계산에 동일하게 사용한다.
- 목록은 품목명/카테고리 검색 및 고정 50개 페이지. 필요 건수와 일괄 재계산은 검색/페이지에 관계없이 회사 전체를 기준으로 한다.
- PG16 합성 5천 개 품목에서 페이지 중복 없음, 검색, 전체 건수, 미지정 품목까지 재계산, 전체 복구를 검증한다.

## 금액 단위와 원가 스냅샷 예외
판매가 `pricing_items.price`, 직접 단가 `pricing_items.direct_price`는 모두 `bigint` 원이다. `price_recalc_changes.before_value/after_value`는 행 전체를 저장하는 JSONB이지만 그 안의 `price/direct_price` 값은 위 bigint 컬럼에서 복사한 정수 원이며, 복구 시 판매가는 다시 bigint로 변환한다.

`applied_cost numeric(14,2)`만 기존 `product_catalog.purchase_price numeric(14,2)`의 정확한 원가를 보존하는 계산 기준 스냅샷 예외다. 예를 들어 800.01원에서 800.02원으로 변한 원가를 bigint로 먼저 반올림하면 변동을 놓치거나 원본과 스냅샷 비교가 계속 불일치할 수 있다. 원가는 소수 둘째 자리까지 보존하고, 마진 계산 후 최종 판매가만 원 단위 올림한다. 기존 원장 원가 타입은 변경하지 않는다.

## SQL 초안 실행·재실행 조건
이 파일은 새 로컬 테스트 DB에 전체를 한 번 적용하는 DDL 초안이며 재실행 가능한 마이그레이션/업그레이드 스크립트가 아니다. 이미 적용된 같은 스키마에서 다시 실행하면 CREATE TABLE 중복 오류로 트랜잭션이 중단된다. 이전 버전 초안을 로컬에 적용했다면 새 폐기용 `pricing_p0_test*` DB를 만들고 최종 초안을 처음부터 한 번 적용한다. 기존 테스트 DB에 덧붙여 실행하거나 운영에 실행하지 않는다.

재계산·복구 요청의 중복 실행 멱등성과 DDL 재실행 가능 여부는 별개다. 이번 문서/주석 보완은 스키마·동작을 바꾸지 않으므로 이 설명만 반영하기 위한 SQL 재실행은 필요 없다. 추후 운영 적용이 승인되더라도 별도의 검토된 배포 절차가 필요하며 이 PR은 적용 승인을 요청하지 않는다.

## Verification (2026-10-29)
- npx tsc --noEmit: PASS.
- npm run lint: PASS (기존 경고는 build에서 표시).
- npm test -- --run: 84 files / 450 tests PASS. pricing 우선순위·페이지·권한 2 files / 21 tests PASS.
- node scripts/check-api-auth-boundaries.mjs: 139 routes PASS.
- PG16.14 loopback 새 DB: 초안 적용, 회사·카테고리 복합 FK/역할 차단/직접→품목→그룹→기본 우선순위/직접 0원·품목 0%·기본 0%/금액·bp 경계/5천 개 조회·검색·전체 재계산·복구/회사 삭제 PASS.
- PG16 병렬 세션: 원가 변경 대기 후 최신 원가 반영, 동시 재계산 중복 방지, 동시 복구 멱등 PASS.
- npm run build: PASS. 요청 시 플래그 판정을 위한 dynamic route 최종 빌드 재확인.
- 보존: 기존 견적·계약·상품 원장 판매가 파일 미수정. 운영 SQL·main push 없음.
- 보완점: 원가 기준은 상품 원장 purchase_price, 기존 공급처 가격 동기화 및 P1~P3는 범위 밖. 접근 불가 와이어프레임과의 시각적 일치 여부는 확인하지 못함.
