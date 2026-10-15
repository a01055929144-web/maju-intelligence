# 메뉴 구조 재편과 매입처 화면 (2026-10-16)

## 변경 전후

| 변경 전 | 변경 후 | 유지 경로 |
|---|---|---|
| 지도 OS > 지도 홈 | TMS 물류효율화 > 지도 홈 | `/dashboard` |
| 성장 > 리드 > 신규 리드 | 영업 > 신규 리드 | `/dashboard?view=leads&leadType=permit` |
| 성장 > 리드 > 영업 리드 | 영업 > 영업 리드 | `/dashboard?view=leads&leadType=keyword` |
| 성장 > AI > AI 영업 | 영업 > AI 영업 | `/assistant` |
| 성장 > 영업 관리 | 운영 관리 > 영업관리 | `/revenue/pipeline`, `/revenue/contacts`, `/sales/performance` |
| 없음 | 운영 관리 > 매입처 | `/purchasing/suppliers` 신규 |
| 운영 > 거래처 관리 + 성장 > 거래내역 | 운영 관리 > 매출처 | `/crm/timeline`, `/revenue/transactions` |
| 성장 > 영업관리 > 상품 매칭 | 운영 관리 > 상품관리 | `/revenue/products` |
| 성장 > 영업관리 > 상품 매칭 | 운영 관리 > 표준 품목 관리 | `/revenue/products?tab=mapping` |
| 지도 내부 코스·히스토리 + 설정 | TMS 물류효율화 > 오늘 코스·배송 이력·권역·호차 | 기존 경로·쿼리·앵커 유지 |
| 운영 > 데이터 등록·등록 이력 | 설정·데이터 | `/`, `/customers/data` |

`결제 관리(/revenue/billing)`는 현재 카드 자동결제와 서비스 이용료 청구가 섞여 있어 1차 사이드바에서 제외한다. 거래처 수금 기능이 되면 매출처로, SaaS 구독 청구이면 운영 설정으로 이동하는 것이 맞다. 라우트는 삭제하지 않는다.

단체메시지는 카카오 연동 범위가 정해질 때까지 준비 중 메뉴도 노출하지 않는다.

## 매입처 화면

`/purchasing/suppliers`는 현재 회사의 `manage_sales` 권한 이상만 접근한다.

- 목록: 매입처명, 상품 수, 최근 업로드, 원가 확정률, 활성 상태
- 상세: 매입 상품 원본명·규격·단위·최신 원가·확정 여부·연결 마스터 상품
- 원가 이력: 최근 원가 관측 기록
- 업로드 이력: 파일명·상태·행 수·완료일
- 회사 내부 비교: 같은 마스터 상품에 연결된 둘 이상의 매입처 확정 원가

모든 조회는 서버에서 세션의 `company_id`를 고정한다. 매입처·원가 데이터는 매장 화면과 공개 견적 DTO에 포함하지 않는다.

## 라우트와 리다이렉트

- 신규 라우트: `/purchasing/suppliers`
- 기존 라우트 변경 없음
- 리다이렉트 추가 없음
- `/routes/today`는 기존처럼 `/dashboard?view=course`로 연결된다.
- `/dashboard/settings?section=tms#territory-settings`는 기존 설정 화면의 권역·호차 섹션을 재사용한다.

매입처 기본정보 스키마 초안: `docs/sql-drafts/product-supplier-business-profile.sql` (실행 금지)
