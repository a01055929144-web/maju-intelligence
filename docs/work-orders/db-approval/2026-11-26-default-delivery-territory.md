# 기본 배송 권역(영업 지역) 데이터 추가 · 홍곱창 배송지 (2026-11-26 00:5x)

- 승인: 대표 "그래 그렇게하고"(영업 지역을 기본 배송 권역으로, 홍곱창 배송지 채우기) — 11/26 00:55
- 원인: 대표 회사는 주문 전 주소 확인(STORE_ORDER_ADDRESS_VERIFICATION)이 켜져 있는데 배송 권역은 "서울 송파구" 1개뿐, 영업 지역(company_lead_search_regions) 19곳과 연결 없음 → 송파 밖 매장 주문 불가. 홍곱창은 배송지(delivery_base_address)도 비어 있었음(11/24 덮어쓰기 영향 가능).
- 적용(운영, 단일 트랜잭션, 데이터만):
  - `delivery_territories`에 "기본 배송 권역(영업 지역)" 추가
  - `delivery_territory_areas`에 영업 지역 중 기존 권역에 없는 18곳(송파구 제외) 추가
  - `store_order_territory_rules` 배송 요일 월~토(마감은 회사 기본: 전날 23:59)
  - 홍곱창 신촌점 `delivery_base_address` = 매장 프로필 주소, `delivery_territory_id` = 새 권역 (비어 있을 때만)
- 남은 것: 홍곱창 **상세 주소(delivery_address_detail)** 는 원래 값 기록이 없어 비워 둠 → 대표가 거래처 배송지 또는 매장 [내 정보]에서 입력해야 주문 가능(주소 확인 규칙상 상세 주소 필수).
- 되돌리기: 새 권역 삭제(areas·rules cascade 여부 확인 후 각각 삭제), 홍곱창 두 칸 null.
- 후속(기능): 영업 지역 → 기본 배송 권역 자동 반영, 지역별 "배송 안 함" 체크, 어긋남 경고 — 클로드코드 새 세션.
