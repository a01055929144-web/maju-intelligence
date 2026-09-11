# 03. Database (Supabase)

`supabase/schema.sql`이 베이스 스키마이고, 이후 변경은 `supabase/migrations/*.sql`에 파일명 날짜순으로 쌓인다. **파일이 저장소에 있다고 실제 DB에 적용됐다는 뜻이 아니다** — 사용자가 Supabase SQL Editor에서 수동 실행해야 반영된다(`docs/00_PROJECT_RULES.md` 참고). DB 관련 작업 전에는 관련 마이그레이션이 실제로 적용됐는지 먼저 확인한다.

## 테이블 목록 (Domain별)

### customer
- `normalized_customers` — 거래처 마스터
- `raw_customer_rows`, `customer_imports`, `column_mappings`, `excel_mapping_presets` — 엑셀/원본 데이터 적재 파이프라인
- `customer_contacts` — 거래처 담당자 연락처
- `customer_attachments` — 사업자등록증/신분증/적재위치 사진 등
- `customer_notes` — 배송 메모(도착완료/부분배송/이슈), delivery와도 연관
- `health_score_snapshots` — 이탈위험 스코어 스냅샷
- `business_number_exceptions` — 사업자번호 중복확인 예외 목록
- `customer_message_logs` — 고객 문자/카카오 발송 이력

### lead
- `business_permit_leads` — 인허가/카카오 키워드 기반 리드
- `lead_recommendations` — 추천 점수
- `lead_actions` — 리드별 액션 이력
- `company_lead_search_regions` — 회사별 확장 탐색 지역

### sales
- `sales_transactions` — 매출 거래 원장
- `ai_reports` — AI 리포트

### route / delivery
- `route_distance_cache` — Tmap 거리 계산 캐시
- `route_plan_confirmations` — 확정된 방문 순서(배송 히스토리의 "계획" 기준)
- `delivery_vehicles` — 배송차량 정보(유종 등)
- `staff_location_events` — 직원 실시간 GPS 이벤트. **1년 보관 후 자동 삭제**(`purgeExpiredStaffLocationEvents`, 매일 22시 크론), 직원 삭제 시 해당 직원 기록 즉시 삭제. 위치정보법상 개인 위치정보로 취급(차량 소유와 무관하게 `driver_name`/`user_id`로 특정 개인의 이동을 식별하기 때문).
- `staff_mobile_devices` — 모바일 기기/푸시 토큰
- `visit_results` — 방문 결과 기록

### organization
- `companies` — 회사(테넌트) 마스터
- `company_members` — 회사 소속 직원(상태: active/inactive)
- `staff_invitations` — 직원 초대(직원별 1회성 링크, 7일 만료, `expiresAtIso` 필드로 클라이언트에서 만료 계산)
- `company_job_titles` — 회사별 커스텀 직무 카탈로그
- `subscriptions`, `subscription_payments` — Toss Payments 연동 구독/결제
- `admin_audit_logs` — 관리자 감사 로그
- `auth_credentials` — 자체 로그인 자격증명(해시)
- `app_users` — 카카오/네이버/구글 OAuth 사용자
- `login_throttle_attempts` — 로그인 시도 제한(Supabase 기반, 여러 서버리스 인스턴스에서도 실제로 작동)

## 테넌트 격리

거의 모든 테이블이 `company_id`(또는 `companyId`)로 테넌트를 분리한다. 새 테이블/쿼리를 추가할 때 이 컬럼 없이 조회하면 다른 회사 데이터가 섞여 보일 수 있다. `lib/auth.ts`의 `getRequestAuthScope`가 요청의 인증 컨텍스트에서 올바른 `companyId`를 뽑아내는 중앙 함수이며, 샘플링 확인 결과 API 라우트 74개 중 61개가 이 함수를 직접 쓰고 나머지도 검증된 다른 안전 패턴을 쓴다.

## 알려진 이슈 / 주의사항

- **마이그레이션 미적용으로 인한 장애 이력**: `20260901_company_message_settings.sql`(companies 테이블에 문자설정 컬럼 6개 추가)이 프로덕션에 몇 주간 미적용 상태로 남아, 회사 설정 저장 기능 전체가 막힌 적이 있음. 이후 유사 사례 방지를 위해 새 마이그레이션을 추가하면 반드시 사용자에게 "Supabase SQL Editor에서 실행해달라"고 명시적으로 안내한다.
- **아직 사용자 확인이 필요한 마이그레이션**(적용 여부 미확인 시점 있었음): `20260907_staff_assignment_override.sql`, `20260907b_company_job_titles.sql`, `20260907c_company_closure.sql`, `20260907d_login_throttle.sql`, `20260907e_permit_sync_cursor.sql`.
- **거래처-리드 교차 중복 미해결**: `mergeDuplicateCustomers`는 `normalized_customers`끼리만 병합하고 `business_permit_leads`와는 교차 검사하지 않는다. 같은 매장이 거래처와 리드에 동시에 존재할 수 있음(Task #23, 미해결).
