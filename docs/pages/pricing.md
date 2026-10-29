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
