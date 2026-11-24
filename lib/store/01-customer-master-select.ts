// 거래처 조회 select 티어·조회 상한 상수입니다(store 분할, 동작 변화 0).
export const CUSTOMER_MASTER_SELECT =
  "id,customer_name,business_registration_number,representative_name,opening_date,region,address,phone,email,birth_date,industry,monthly_revenue,last_order_days,visit_count,delivery_km,delivery_minutes,delivery_manager,delivery_zone,loading_position,business_status,business_status_checked_at,business_license_file_url,bank_account_file_url";
export const CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS = `${CUSTOMER_MASTER_SELECT},naver_place_url,kakao_place_url,google_map_url,place_links_checked_at`;
export const CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS_AND_HOURS_MENU = `${CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS},business_hours,menu_summary`;
export const CUSTOMER_MASTER_SELECT_WITH_RELATIONSHIP_STATUS = `${CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS_AND_HOURS_MENU},relationship_status,relationship_status_updated_at,relationship_status_note`;
// 배송차(deliveryVehicle)는 담당자(deliveryDriver)와 별개로 지정할 수 있는 독립된 값입니다.
// supabase/migrations/20260818_customer_delivery_vehicle.sql을 아직 실행하지 않은 환경에서도
// 나머지 거래처 조회가 함께 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
export const CUSTOMER_MASTER_SELECT_WITH_DELIVERY_VEHICLE = `${CUSTOMER_MASTER_SELECT_WITH_RELATIONSHIP_STATUS},delivery_vehicle`;
// 거래처 카드에 리뷰 기반 키워드 뱃지·AI 요약을 보여주기 위한 컬럼입니다.
// supabase/migrations/20260818b_customer_contacts_and_review_enrichment.sql을 아직 실행하지 않은 환경에서도
// 나머지 거래처 조회가 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
export const CUSTOMER_MASTER_SELECT_WITH_REVIEWS = `${CUSTOMER_MASTER_SELECT_WITH_DELIVERY_VEHICLE},review_summary,review_keywords,review_source,reviews_updated_at`;
// 거래처 출입방법(열쇠/카드/비밀번호/숨김위치)·비밀번호를 저장하기 위한 컬럼입니다(2026-08-24 피드백:
// "거래처의 출입방법과 비밀번호를 저장해야해. 놓친 것 같아"). supabase/migrations/20260824_customer_access_method.sql을
// 아직 실행하지 않은 환경에서도 나머지 거래처 조회가 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
export const CUSTOMER_MASTER_SELECT_WITH_ACCESS_METHOD = `${CUSTOMER_MASTER_SELECT_WITH_REVIEWS},access_method_type,access_note,access_password`;
// 동시 편집 감지(낙관적 동시성 제어)용 updated_at입니다. supabase/migrations/20260831c_normalized_customers_updated_at.sql을
// 아직 실행하지 않은 환경에서도 나머지 거래처 조회가 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
export const CUSTOMER_MASTER_SELECT_WITH_CONCURRENCY = `${CUSTOMER_MASTER_SELECT_WITH_ACCESS_METHOD},updated_at`;
// 수동 등급은 월 매출 기반 자동 등급보다 우선합니다. 마이그레이션이 아직 적용되지 않은 환경은
// 바로 아래 조회 티어로 폴백해 기존 자동 등급을 계속 사용합니다.
export const CUSTOMER_MASTER_SELECT_WITH_GRADE_OVERRIDE = `${CUSTOMER_MASTER_SELECT_WITH_CONCURRENCY},grade_override`;
// PHASE 1 assignment IDs are the authoritative references once populated. This remains the
// outermost tier so older/local databases can still fall back to the legacy text-only model.
export const CUSTOMER_MASTER_SELECT_WITH_ASSIGNMENT_IDS = `${CUSTOMER_MASTER_SELECT_WITH_GRADE_OVERRIDE},assigned_staff_member_id,delivery_vehicle_id,delivery_territory_id`;
export const CUSTOMER_MASTER_SELECT_WITH_BUSINESS_IDENTITY = `${CUSTOMER_MASTER_SELECT_WITH_ASSIGNMENT_IDS},business_name,sub_business_number,business_entity_type,corporate_registration_number`;
// Fixed caps keep reads predictable; callers expose a partial-data warning when caps are hit.
export const CUSTOMER_MASTER_FETCH_LIMIT = 3000;
export const SALES_TRANSACTIONS_FETCH_LIMIT = 1000;
