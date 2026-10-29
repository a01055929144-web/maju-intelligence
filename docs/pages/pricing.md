# 가격표 ①-2 — P0

Owner Domain: pricing. Related: product (원장 매입가 읽기), organization (대표 권한/회사 격리).

## Allowed Files
- domains/pricing/*, application/pricing/*, lib/pricing/*
- app/api/price-sheets/route.ts, app/revenue/pricing/page.tsx
- components/price-sheets-workspace.tsx, tests/pricing-*.test.ts
- docs/sql-drafts/20261030-pricing-p0.sql, tests/sql/pricing-p0.sql
- scripts/test-pricing-p0-local.mjs

## Scope / Preserve
마진 그룹, 회사 상품별 그룹 지정/직접 단가, 원가 변동분 일괄 재계산, 직전 실행 복구만 구현한다.
매출총이익률 = (판매가 - 원가) / 판매가. 마진은 0~9999bp, 원 단위 정수 가격 상한 1조원.
직접 단가(0원 포함) > 그룹 마진. 원가 0원·비활성은 일괄 계산 제외.
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

## Verification (2026-10-29)
- npx tsc --noEmit: PASS.
- npm run lint: PASS (기존 경고는 build에서 표시).
- npm test -- --run: 84 files / 446 tests PASS. 최종 소수 원가 보완 후 pricing 2 files / 17 tests 재실행 PASS.
- node scripts/check-api-auth-boundaries.mjs: 139 routes PASS.
- PG16.14 loopback 새 DB: 초안 적용, 회사 복합 FK/역할 차단/직접 0원/금액·bp 경계/회사 삭제/복구 멱등·충돌 PASS.
- PG16 병렬 세션: 원가 변경 대기 후 최신 원가 반영, 동시 재계산 중복 방지, 동시 복구 멱등 PASS.
- npm run build: PASS. 요청 시 플래그 판정을 위한 dynamic route 최종 빌드 재확인.
- 보존: 기존 견적·계약·상품 원장 판매가 파일 미수정. 운영 SQL·main push 없음.
- 보완점: 원가 기준은 상품 원장 purchase_price, 기존 공급처 가격 동기화 및 P1~P3는 범위 밖. 접근 불가 와이어프레임과의 시각적 일치 여부는 확인하지 못함.
