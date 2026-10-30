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
마진율(매입가 대비) = 추가 금액 / 매입가. 판매가 = ceil(매입가 × (10000 + bp) / 10000 / 올림 단위) × 올림 단위. 범위는 0~100000bp(0~1000%), 마진율은 소수 둘째 자리까지이며 가격 상한은 1조원이다. 예: 18,910원 · 12% · 10원 올림 → 21,180원. 기존 견적 도메인의 계산식은 변경하지 않는다.
가격 우선순위: 직접 단가(0원 포함) → 품목 마진(0% 포함) → 그룹 마진 → 회사 기본 마진 → 올림. 직접 단가는 올림하지 않는다. null/빈 값은 상속이며 0은 명시값이다. 원가 0원·비활성은 일괄 계산 제외.
그룹은 품목에 우선 지정한 그룹이 있으면 해당 그룹, 없으면 product_catalog.category와 정확히 일치하는 카테고리 연결로 결정한다. 카테고리 연결이 없으면 회사 기본 마진을 적용한다. 회사 설정 초기값은 0%, 10원 올림이다.
기존 견적/계약/상품 원장 판매가는 수정하지 않는다. P1~P3, 보류 메뉴 노출 금지.

## Activation
PRICE_SHEETS_ENABLED=false 기본. true + HOLD_MODULES_ENABLED_COMPANY_IDS 회사 허용 + owner 또는 manager 권한이 필요하다. workspaceRole을 우선 판정하며 구형 세션은 role=owner를 허용한다. API와 화면이 같은 가격표 권한 규칙을 사용하고 영업·배송·일반·임시 직원은 차단한다.
OFF 시 화면/API 404 및 신규 테이블 조회 없음. 메뉴 링크는 추가하지 않음.
운영 SQL 실행 금지. 적용 승인·스키마 확인 전 플래그 활성화 금지.

## Concurrency / recovery
회사 행 잠금으로 가격표 쓰기를 직렬화한다. 재계산 동안 상품 행 잠금으로 원가 변경과 계산의 시점을 일치시킨다.
중복 재계산은 변경분이 없으면 새 실행을 만들지 않는다. 복구는 마지막 실행만 가능하며 같은 복구 재시도는 성공한다.
품목 전체 스냅샷/수정 번호가 실행 직후와 다르면 전체 복구를 취소한다. 원가는 복구하지 않는다.
복구 후 다시 계산 필요 건수는 현재 원가·그룹 설정과 이전 계산 기준의 차이에서 산출한다.

## Source limitation
최신 main b6dcb05의 docs/pages/09_ORDER_PRICING_WIREFRAMES.md(22화면) 중 공통 원칙 및 ①-2를 구현 기준으로 확인했다. 22화면 전체는 이번 P0 범위가 아니다. 외부 Claude 링크는 접근 불가하며 문서에서 언급한 claude/order-pricing-design-2026-10-29.md는 최신 main에 없다.
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
- ①-2 구성: 이름·매입가 대비 마진율·올림·연결 분류를 보여주는 그룹 카드, 분류 연결/해제, 회사 기본 마진/올림, 재계산/복구, 50개 품목 표.
- PG16 합성 5천 개 품목에서 페이지 중복 없음, 검색, 전체 건수, 미지정 품목까지 재계산, 전체 복구를 검증한다.

## 금액 단위와 원가 스냅샷 예외
판매가 `pricing_items.price`, 직접 단가 `pricing_items.direct_price`는 모두 `bigint` 원이다. `price_recalc_changes.before_value/after_value`는 행 전체를 저장하는 JSONB이지만 그 안의 `price/direct_price` 값은 위 bigint 컬럼에서 복사한 정수 원이며, 복구 시 판매가는 다시 bigint로 변환한다.

`applied_cost numeric(14,2)`만 기존 `product_catalog.purchase_price numeric(14,2)`의 정확한 원가를 보존하는 계산 기준 스냅샷 예외다. 예를 들어 800.01원에서 800.02원으로 변한 원가를 bigint로 먼저 반올림하면 변동을 놓치거나 원본과 스냅샷 비교가 계속 불일치할 수 있다. 원가는 소수 둘째 자리까지 보존하고, 마진 계산 후 최종 판매가만 원 단위 올림한다. 기존 원장 원가 타입은 변경하지 않는다.

## SQL 초안 실행·재실행 조건
이 파일은 새 로컬 테스트 DB에 전체를 한 번 적용하는 DDL 초안이며 재실행 가능한 마이그레이션/업그레이드 스크립트가 아니다. 이미 적용된 같은 스키마에서 다시 실행하면 CREATE TABLE 중복 오류로 트랜잭션이 중단된다. 이전 버전 초안을 로컬에 적용했다면 새 폐기용 `pricing_p0_test*` DB를 만들고 최종 초안을 처음부터 한 번 적용한다. 기존 테스트 DB에 덧붙여 실행하거나 운영에 실행하지 않는다.

재계산·복구 요청의 중복 실행 멱등성과 DDL 재실행 가능 여부는 별개다. 주석·설명만 반영하는 경우에는 SQL 재실행이 필요 없다. 매입가 대비 공식과 100000bp 상한으로 바뀐 이번 최종 초안은 이전 계산식/범위의 로컬 스키마에 덧붙이지 않고 새 폐기용 DB에서 전체를 한 번 검증한다. 추후 운영 적용이 승인되더라도 별도의 검토된 배포 절차가 필요하며 이 PR은 적용 승인을 요청하지 않는다.

## Verification (2026-10-29)
- npx tsc --noEmit: PASS.
- npm run lint: PASS (기존 경고는 build에서 표시).
- npm test -- --run: 최신 main 병합 후 86 files / 466 tests PASS. pricing 공식·우선순위·페이지·owner/manager 권한 2 files / 29 tests PASS.
- node scripts/check-api-auth-boundaries.mjs: 139 routes PASS.
- PG16.14 loopback 새 DB: 초안 적용, 회사·카테고리 복합 FK/역할 차단/직접→품목→그룹→기본 우선순위/직접 0원·품목 0%·기본 0%/매입가 대비 18,910·12%·10원 올림=21,180 및 100000bp 상한/5천 개 조회·검색·전체 재계산·복구/회사 삭제 PASS.
- PG16 병렬 세션: 원가 변경 대기 후 최신 원가 반영, 동시 재계산 중복 방지, 동시 복구 멱등 PASS.
- npm run build: PASS. 요청 시 플래그 판정을 위한 dynamic route 최종 빌드 재확인.
- 보존: 기존 견적·계약·상품 원장 판매가 파일 미수정. 운영 SQL·main push 없음.
- 보완점: 원가 기준은 상품 원장 purchase_price, 기존 공급처 가격 동기화 및 P1~P3는 범위 밖. 외부 캔버스와의 시각적 일치는 미확인이나 저장소 텍스트판의 ①-2 구성은 반영.

# Pricing P1 추가 범위 (2026-10-30)

## Owner / Allowed files
소유 pricing, 관련 product(기존 상품 읽기), organization(권한/작성자 경계).
허용: domains/pricing/document.ts, application/pricing/documents.ts, lib/pricing/document-client.ts 및 documents-repository.ts, app/api/pricing-documents/route.ts, app/revenue/pricing/documents/page.tsx, components/pricing-document*.tsx, docs/sql-drafts/20261030-pricing-p1.sql, tests/pricing-p1*.test.ts, tests/sql/pricing-p1*.sql, scripts/test-pricing-p1*.mjs, 이 문서.

## P1 흐름
- 단가표/작성자 전용 견적서: 새로 작성, 현재 가격의 품목 선택, 노출명/과세 확인, 직접 단가 및 대표·관리자의 일괄/개별 마진, 순서/숨김/표시, 초안 저장, 버전 확정, 버전 선택, 견적서로 복사.
- 버전은 공개에 안전한 필드만 화이트리스트로 저장하고 수정할 수 없다. 회사·문서·초안 수정 번호로 중복 확정 및 저장 충돌을 방지한다.
- 견적은 같은 회사 대표·관리자라도 다른 작성자의 문서를 볼 수 없다. 단가표는 회사 내부에서 공용이며 대표·관리자만 편집한다. 영업직원은 판매가만 조회하고 자기 견적·개인 묶음을 작성한다.
- 행사/임박: 일반 상품 연결, 직원 관리명과 매장 노출명 분리, 매입가 대비 마진, 날짜, 선택 재고·매장별 한도, 단가표 표시 허용. 종료·재고 0 및 삭제된 행사 줄은 버전 출력에서도 제외한다.
- 묶음/템플릿: 품목 번호·순서만 저장, 공용/개인, 생성·수정·복사·삭제. 상품 코드 첫 열(선택 머리글 상품코드)의 xlsx 가져오기. 불러올 때 현재 가격을 재계산한다.
- 회사 인쇄 기본값(회사명·담당/연락처·하단 안내)을 새 문서에 복사한다. 기존 확정본은 변경하지 않는다.
- 하나의 안전한 출력 모델로 온라인 휴대폰/오프라인 A4, 3테마, 카드/표/자동, 브랜드/규격/가격 표시, 페이지별 PNG 및 PDF·인쇄를 제공한다. 만료 후 가격은 숨기고 품목명은 유지한다.

## 배포 및 보존
PRICE_SHEETS_ENABLED 기본 OFF + 보류 회사 허용 필요. 보류 메뉴 링크 추가 없음. 운영 DB/기존 견적·계약/공개 견적 API 수정 없음.
SQL은 새 폐기용 로컬 PG16 DB에 한 번 적용하는 초안이다. P0 초안 선행 필요. 운영 적용 금지, 기존 DB에 덧붙여 재실행하지 않는다. RLS direct deny, RPC service_role 전용, 회사 FK·회사 삭제 cascade.
매장별 공개 링크/주문·재고 차감·결제는 P2 이후이며 이번 P1에서 가짜 링크나 주문 기능을 노출하지 않는다. 행사 매장별 한도는 P1에서 저장하며 주문 확정 시 적용은 주문 도메인 단계에서 연결한다.


## P1 검증 (2026-10-30)
- 최신 main e5e049b 기준 기능 브랜치 codex/09-pricing-p1. 시작/커밋 전 확인에서 충돌 없음. 사용자 백업·P0 작업 폴더 소스 보존.
- 전체 테스트: 92 files / 499 tests PASS. P1 화이트리스트·만료·행사·페이지·과세 미확정·출처/권한 회귀 포함.
- npx tsc --noEmit, npm run lint, npm run build PASS. 기존 파일 경고는 유지하고 새 파일 오류 없음.
- API 인증 경계: 141 routes PASS.
- 로컬 PG16 새 DB: P0+P1 초안 생성, 회사/작성자 경계, 판매가·노출명 화이트리스트, 변경 전 버전 보존, 중복 확정, 동시 확정/저장 충돌, 공용/개인 묶음·템플릿 수정/삭제, 행사 품절/삭제, 인쇄 기본값과 회사 삭제 cascade PASS.
- 실제 브라우저→API→로컬 PG16→응답: 단가표 저장/확정/버전 1 보존, 영업직원 견적/다른 작성자 404, 원가·관리명 비노출, 묶음/템플릿 생성·복사·현재 가격 불러오기, 행사 등록/견적 삽입/품절 후 PNG 제외 PASS.
- 실제 브라우저: 과세 미확정 확인 전 저장 차단 및 확인 후 진행, XLSX 상품 코드 읽기, 390px 화면, 1588×2246 PNG 및 A4 PDF 생성 PASS.
- 긴 제목·품목명·하단 안내와 21개 품목을 사용한 A4 11쪽: 내용 넘침 없음, PDF 실제 쪽 수 일치 PASS. 출력 모델과 실제 PNG를 시각 확인.
- 브라우저 스크립트는 합성 계정/상품·loopback RPC 어댑터만 사용하며 운영 Supabase/메일·메시지 전송을 호출하지 않는다. 실행 명령: PRICING_P1_LOCAL_DATABASE_URL을 새 pricing_p1_test* DB로 지정해 scripts/test-pricing-p1-local.mjs, 그 초기화된 DB에서 scripts/test-pricing-p1-browser.mjs 실행. 산출물은 저장소 밖 ../outputs/pricing-p1-browser에 생성.
- 확인한 문제와 보완: PG16 임시 리소스/한글 경로 제한은 영문 전용 테스트 경로로 해결. Next 내부 localhost 정규화에 따른 출처 검사 불일치는 실제 Host 기준으로 보완하고 회귀 테스트. 테스트 XLSX는 메모리 버퍼→Node 파일 저장으로 경로 의존을 제거.
