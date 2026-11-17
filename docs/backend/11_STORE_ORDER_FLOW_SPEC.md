# 매장 주문 흐름 — 와이어프레임 ↔ 운영 스키마 맞춤 (v1 · 2026-11-17 21:2x · 컨트롤타워)

**기준 와이어프레임**: 매장 화면 캔버스 v5+ https://claude.ai/artifact/NfA5ZR2VGUM6St5hM2pucY (모바일 ⓪~⑧ ↔ PC 짝, PC ①-1, 고객사 "새 매장 → 매출처")
**스키마 기준**: 운영 DB `fcmdvveqmcgtioelzqun` 읽기 조회(11/17 21시). 값 · 개인정보는 보지 않고 컬럼 · 제약 · 함수 이름만 봄.
**Owner Domain**: `store`(매장 계정 · 프로필) / Related: `customer`(매출처), `sales`(주문 · 전표), `pricing`(카탈로그 · 행사)

## 1. 대표 결정 (11/17 저녁)
1. 링크로 연 **단가표 · 견적서는 가입 없이** 누구나 봄. 기본 = 표, 탭으로 문서 이미지(오프라인 A4 그대로).
2. **전체 상품은 가입 후**(가입 메리트). 가입 전 화면에는 흐린 미리보기 + 카카오 시작.
3. 가입 전에도 단가표 품목은 담을 수 있고, 가입 뒤에도 그대로.
4. **거래 약관은 카카오 시작 동의에 함께**(별도 화면 없음).
5. 매장 정보: 사업자번호(국세청 계속사업자만) · 사업자 상호 · 종사업장 · 대표자 · **계산서 이메일** · **카카오 주소** + 상세 주소 · 받는 방법/시간 · **냉장/냉동/실온 보관 사진** · **새벽 출입 비밀번호**.
6. **개업 준비 중 = 셀프 가입 불가** → 고객사 대표번호로 전화, 고객사가 확인 후 열어 줌(경쟁사 위장 가입 차단).
7. 매장 정보는 **고객사에 보임**. 법인 하나에 매장 여럿 가능, 매장(종사업장)마다 매출처 따로, 과세/면세 전표 각각.
8. **장바구니 = 자동 저장만**, [주문하기]를 눌러야 유통사에 주문 접수(화면에 분명히).
9. **주문 마감**(유통사별), **행사 남은 재고 · 매장당 한도**, **품목별 마감**을 화면에 표시.
10. 주문 화면: 유통사 탭 → 대 › 중 › 소(고를 때마다 나타남), 장바구니는 아래 고정 바.
11. 전표 시점: 접수 = 작성중, 출고 확정 = 확정 + 원장 · 재고(R8 결정, 그대로).

## 2. 화면 ↔ 스키마 대조
| 화면 요소 | 이미 있음 | 빈 곳 (이번 작업) |
|---|---|---|
| 링크 표 · 이미지 | `pricing_document_share_links` · `pricing_document_versions.content` · `resolve_storefront_short_link_v1` | 공개 "표" 응답(품목 · 단가 · 행사만, 가격 외 내부값 없음) |
| 가입 전 담기 | — | **서버 테이블 만들지 않음**: 브라우저 저장 → 가입 직후 `save_store_order_cart_line`으로 옮김(같은 링크 · 같은 회사만) |
| 전체 상품(가입 후) | `store_member_order_catalog` · `product_catalog.category` · 등급가 | 유통사 탭 + 대/중/소 필터 인자, 공통 카테고리 맞춤(ERP ⑬-4) |
| 약관 동의 | `store_profiles.terms_version/terms_accepted_at` · `store_accounts.terms_*` | 카카오 시작 때 같이 기록(새 칸 없음) |
| 사업자 · 상호 · 종사업장 · 법인 | `store_profiles.business_registration_number/business_name/sub_business_number/business_entity_type/representative_name` (사업자번호 유일 제약 없음 → 법인 여러 매장 가능) | — |
| 계산서 이메일 | `normalized_customers.email`(매출처 쪽) | **`store_profiles.tax_invoice_email`** 추가 |
| 주소 | `store_profiles.base_address/address_detail` · 매출처 `delivery_base_address/detail` + 좌표 | 카카오 주소 부품 = 고객사 정보 입력과 같은 컴포넌트, 좌표 저장 |
| 받는 방법 · 시간 · 출입 메모 | `store_profiles.preferred_delivery_time/access_note/delivery_contact_phone` | 받는 방법(문 앞/매장 안/새벽) 칸 |
| 새벽 출입 비밀번호 | `normalized_customers.access_password` (평문) | **암호화 안 함(대표 결정 21:21)**. 대신 **보는 사람 제한**: 그 매장 **담당 = 배송 기사**(그 매장이 들어간 배송 코스 · 차량에 배정된 기사, 대표 21:24) · 권한 있는 내근직만. 일반 목록 · 엑셀 · 로그 · 알림 응답에서 빼고 전용 읽기 함수로만 |
| 보관 사진 3장 | `customer_attachments`(매출처 쪽) | 매장 프로필 첨부(종류: 냉장/냉동/실온) · 매출처로 공유 |
| 개업 준비 중 | `business_status='registration_pending'` · ⚠ `activate_preopening_store_owner_v1`(셀프 경로) | **셀프 경로 차단**: 고객사가 만든 `store_owner_activation_requests`로만 |
| 고객사 확인 → 매출처 | `store_accounts.customer_review_status` · `confirm_new_store_account_v1` · `confirm_store_customer_v1` · `link_store_account_to_customer_v1` · `store_customer_review_candidates_v1` | 같은 사업자번호 묶어 보기, 만들 때 프로필 → 매출처 칸 복사(관리 상호명은 따로) |
| 과세/면세 | `product_catalog.tax_type` · `store_order_lines.tax_type` · `business_documents.taxable/exempt_supply` · `tax_invoices.invoice_kind` | 확인만(품목별 자동) |
| 장바구니 자동 저장 | `store_order_cart` · `save_store_order_cart_line` · `store_order_cart_lines` | 화면 문구만 |
| 주문하기 = 접수 | `place_store_catalog_order_core_v1` 등 | **CX-62 하나로 모음**(아래 4절) |
| 유통사 마감 | `store_order_settings/territory_rules/customer_rules.cutoff_*` · `store_order_holidays` | 남은 시간 계산 응답 |
| 행사 남은 재고 · 한도 | `pricing_promotions.stock/per_store_limit` (core 함수가 검사) | **남은 수량 응답**(stock − 접수된 수량, 취소 제외) |
| 품목별 마감 | — | **`product_catalog.order_cutoff_days_before` + `order_cutoff_time`** (null = 유통사 마감) |

## 3. 스키마 변경 초안 (모두 `docs/sql-drafts/` 초안 + down + PG17 → 대표 승인 → 잠금 → 적용)
| 초안 | 내용 | 위험 |
|---|---|---|
| S-3a store-profile-delivery | `store_profiles`에 `tax_invoice_email`(형식 체크) · `receive_method`('door','inside','dawn') · `access_password`(text, 길이 체크) · `access_password_updated_at`; 프로필 첨부 테이블(`store_profile_attachments`: kind cold/frozen/room, storage_path) + RLS | 비밀번호 칸은 일반 select에서 빼고(별도 테이블 또는 컬럼 권한) 읽기 함수가 매장 본인 · 그 매장 배송 기사 · 권한 있는 내근직만 돌려줌 |
| S-3b product-order-cutoff | `product_catalog.order_cutoff_days_before smallint null` · `order_cutoff_time time null` + core 주문 함수가 품목 마감 검사 | 돈: 마감 지난 품목 접수 거부 · 서버 기준 시각(Asia/Seoul) |
| S-3c promotion-remaining | 읽기 함수 `promotion_remaining_v1(company, promotion_ids[])` (security definer, 회사 범위) | 동시 주문 → 접수 때 core가 다시 잠금(`for update`) 검사, 화면 값은 안내용 |
| S-3d preopening-gate | `activate_preopening_store_owner_v1`을 고객사가 준비한 요청 토큰 있을 때만 허용(없으면 거부) | 기존 매장 영향 없음 · 셀프 가입 막힘 |
| S-3e access-password-visibility | 암호화 없음. `normalized_customers.access_password`를 일반 조회 · 내보내기 · 감사 로그 응답에서 빼고, 읽기 함수 `customer_access_password_v1(customer_id)` = 그 매장 배송 기사(코스 정류장 · `delivery_vehicle_id` 배정) · 권한(`customer.access_password.view`) 있는 내근직만 | 데이터 변경 없음 · 권한 경계만 |

## 4. 주문 함수 정리 (돈 안전 점검표 대상)
운영에 주문 접수 함수가 여러 개: `place_store_order` · `place_store_member_order` · `place_store_account_order(s)` · `place_store_catalog_order_v1` · `place_store_catalog_member_order_v1` · `place_store_catalog_order_core_v1`.
- 마감 · 재고 · 한도 검사: `core_v1` · `place_store_order` · `place_store_member_order`에는 있음, **`place_store_account_orders`에는 문자열이 없음 → 다른 함수를 거치는지 확인 필요**.
- CX-62(#1015)에서 **접수 진입점을 하나(core)로** 모으고 나머지는 core 호출만 하게. 멱등 키 · 금액 서버 재계산 · 마감/재고/한도/품목 마감 검사 · 유통사별 주문서 분리 · 실패 시 전부 롤백.

## 5. 고객사 쪽 (매출처 관리 › 새 매장)
- 목록: 확인 필요 · 대기(개업 준비 중) · 연결됨, **같은 사업자번호 묶어 보기**.
- [새 매출처로 만들기]: 프로필 → `normalized_customers` 칸 복사(business_name · sub_business_number · business_entity_type · 주소 · 받는 곳 · 보관 첨부 · 계산서 이메일→email), 관리 상호명 · 등급 · 담당 · 권역 · 결제 조건은 고객사가 정함.
- [기존 매출처에 연결]: `link_store_account_to_customer_v1`.
- 매장이 프로필을 고치면 `apply_store_profile_notification_v1` 알림 → 고객사가 반영 여부 선택(자동 덮어쓰기 금지).
- 개업 준비 중: 고객사가 [확인 후 열어 주기] = activation request 발급.

## 6. 하지 말 것
- 가입 전 가격에 매장 등급가 노출 금지(단가표 가격만). 전체 상품 · 등급가는 로그인 + 연결 회사만.
- 비밀번호 · 보관 사진을 로그 · 알림 · 엑셀에 넣지 않기. 비밀번호는 암호화하지 않되 보는 사람만 제한(담당 = 그 매장 배송 기사 · 권한 있는 내근직). 기사 화면은 그 매장 정류장에서만 보여 줌.
- 장바구니를 주문으로 보이게 하는 문구 금지("주문하기" 누르기 전엔 "아직 주문 전").
- 카톡 · 문자 자동 발송 없음.
