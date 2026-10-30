# 02. Domain Map

`lib/store.ts`(10,744줄, export 함수 138개)는 아직 파일로 분리되지 않았다. 이 문서는 그 안의 함수와 Supabase 테이블을 **논리적으로** 어느 Domain이 소유하는지 정리한 잠정 지도다. 새 함수를 추가할 때 참고하고, 추가한 뒤에는 이 문서도 함께 갱신한다.

## customer

**책임**: 거래처 마스터 데이터, 연락처, 첨부파일, 메모, 관계상태(이탈위험), 중복 탐지/병합, 리뷰 요약, 고객 로그인/워크스페이스.

- 함수: `getCustomerMaster`, `upsertCustomerMaster`, `bulkUpdateCustomerGradeOverride`, `makeCustomerKey`, `findDuplicateCustomerCandidates`, `mergeDuplicateCustomers`, `normalizeNameForDuplicateCheck`, `getCustomerOperations`, `getCustomerOperationsSummary`, `listCustomerContacts`, `upsertCustomerContact`, `deleteCustomerContact`, `addCustomerAttachment`, `createCustomerAttachmentSignedUrl`, `uploadCustomerAttachmentFile`, `addCustomerNote`, `setCustomerRelationshipStatus`, `getChurnRiskCustomers`, `sendDailyChurnRiskDigests`, `syncCustomerGoogleReviews`, `summarizeCustomerReviewText`, `refreshCustomerBusinessStatuses`, `refreshAllCompaniesBusinessStatuses`, `canAccessAssignedCustomer`, `getCustomerWorkspaces`, `leaveCustomerWorkspace`, `getCustomerAuthConnections`, `getCustomerLoginCredentials`, `updateCustomerPasswordHash`, `updateCustomerUserLastLogin`, `getBusinessNumberExceptions`, `addBusinessNumberException`, `removeBusinessNumberException`, `getExemptBusinessNumberSet`
- 테이블: `normalized_customers`, `raw_customer_rows`, `customer_contacts`, `customer_attachments`, `customer_notes`, `customer_imports`, `column_mappings`, `excel_mapping_presets`, `health_score_snapshots`, `business_number_exceptions`
- 알려진 이슈: 중복 병합(`mergeDuplicateCustomers`)은 `normalized_customers`끼리만 병합하고 `lead`/`business_permit_leads` 쪽과는 교차 검사하지 않음(같은 매장이 거래처와 리드에 동시에 존재하는 케이스 미해결, Task #23 관련).

## lead

**책임**: 인허가 기반 신규/영업 리드 수집·분류·추천, 카카오 키워드 리드, 리드 액션 이력.

- 함수: `getLatestLeads`, `getLeadSyncStatus`, `listPermitLeads`, `getPermitLeadQueues`, `findNearbyPermitLeads`, `ingestPermitLeadRows`, `updatePermitLeadProfile`, `deletePermitLead`, `convertPermitLeadToCustomer`, `classifyPermitLeadIndustry`, `computePermitLeadPeriod`, `parseRawStoreArea`, `profileStoreAreaSource`, `compareStoredStoreAreaSources`, `getAdminStoreAreaProfile`, `enrichPermitLeadExternalInfo`, `enrichPermitLeadKeywordVolume`, `enrichLeadsMissingContactInfo`, `enrichAllCompaniesLeadsMissingContactInfo`, `recordPermitLeadAction`, `listPermitLeadActions`, `leadActionRepository`, `refreshPermitLeadRecommendationScores`, `refreshAllCompaniesRecommendationScores`, `updateLeadStatus`, `syncGovRestaurantLeads`, `syncAllCompaniesGovRestaurantLeads`, `syncSeoulRestaurantLeads`, `syncAllCompaniesSeoulRestaurantLeads`, `runKakaoKeywordLeadSweep`, `syncAllCompaniesKakaoKeywordLeads`, `getCompanyLeadSearchRegions`, `addCompanyLeadSearchRegion`, `removeCompanyLeadSearchRegion`
- 테이블: `business_permit_leads`, `business_permit_lead_source_records`, `lead_recommendations`, `lead_actions`, `lead_enrichment_events`, `company_lead_search_regions`
- 액션 확장 필드: `lead_actions.collateral_types`(전달 자료), `lead_actions.follow_up_at`(후속 일정), `lead_actions.metadata`(채널·컨텍스트 확장값). 자동·수동 외부정보 보강과 인스타 정보 수정 같은 기술 이벤트는 영업 액션과 분리해 `lead_enrichment_events`에 기록한다.
- 관련 파일: `lib/gov-restaurant.ts`, `lib/seoul-restaurant.ts`, `lib/kakao-keyword-leads.ts`, `lib/leads.ts`, `lib/lead-store-area-profile.ts`, `domains/lead/store-area-source-profile.ts`, `docs/sql-drafts/admin-store-area-profile-rpc.sql`
- 알려진 이슈: 없음(이번 세션에서 신규리드/영업리드 분류 버그, 개시일 미확인 리드 필터 우회 버그 모두 수정 완료 — Task #45, #49, #73, #78).

## sales

**책임**: 매출 거래 매칭, 파이프라인 후보, AI 영업 어시스턴트 초안, AI 리포트.

- 함수: `getSalesTransactions`, `matchSalesTransactionsToCustomer`, `getRevenuePipeline`, `getSalesAssistantDrafts`, `saveAnalysis`, `getLatestReport`, `getReportById`, `getLatestBriefing`
- 테이블: `sales_transactions`, `ai_reports`
- 관련 파일: `lib/analysis.ts`

## quote

**책임**: 매입 상품과 판매 품목의 매칭, 마진 기반 판매가 계산, 견적 발행·유효기간·공개 링크, 고객용 원가 비노출 응답.

- 함수: `listProductCatalog`, `uploadSalesQuotePhoto`, `createSalesQuote`, `listSalesQuotes`, `getPublicSalesQuote`, `applyDefaultMargin`, `calculateQuoteLine`, `calculateQuoteTotals`, `toCustomerQuoteLines`, `resolveQuoteValidUntil`, `normalizeProductToken`
- 테이블: `product_catalog`, `sales_quotes`, `sales_quote_items`
- 관련 파일: `domains/quote/quote.ts`, `components/mobile-quote-builder.tsx`, `app/api/product-catalog/route.ts`, `app/api/sales-quotes/route.ts`, `app/api/public/quotes/[token]/route.ts`, `app/quote/[token]/page.tsx`
- 경계 규칙: 매입가·마진율은 회사 내부 편집 화면에서만 사용한다. 공개 견적 조회는 UUID 토큰과 유효기간을 검증하고 고객 응답에서 원가·마진 컬럼을 SELECT 단계부터 제외한다.

## route

**책임**: 오늘의 방문 순서, 경로 확정, 거리 캐시.

- 함수: `getTodayRoutePlan`, `saveRouteOrderConfirmation`, `saveRouteDistanceCache`
- 테이블: `route_distance_cache`, `route_plan_confirmations`
- 관련 파일: `lib/tmap.ts`, `lib/route-map-markers.ts`, `app/api/routes/*`

## delivery

**책임**: 배송차량 정보, 배송완료 기록, 직원 실시간 GPS, 배송 히스토리, 방문 결과.

- 함수: `getDeliveryCompletionEvents`, `getDeliveryHistoryForDate`, `getDeliveryHistorySummary`, `getDeliveryVehicleFuelTypes`, `upsertDeliveryVehicleFuelType`, `deleteDeliveryVehicleFuelType`, `vehicleMasterRepository`, `bulkUpdateDeliveryManager`, `bulkUpdateDeliveryVehicle`, `bulkClearDeliveryAssignment`, `getStaffLocationEvents`, `getStaffVehicleLocations`, `upsertStaffMobileLocation`, `purgeExpiredStaffLocationEvents`, `saveVisitResult`, `getVisitTimeline`, `sendCustomerDeliveryMessage`
- 테이블: `delivery_vehicle_master`, `delivery_vehicles`, `staff_location_events`, `staff_mobile_devices`, `visit_results`
- 관련 파일: `domains/delivery/vehicle-master.ts`, `application/delivery/manage-vehicle-master.ts`, `app/api/delivery-vehicle-master/route.ts`
- 알려진 정책: `staff_location_events`는 1년 보관 후 자동 삭제(`purgeExpiredStaffLocationEvents`, 매일 크론), 직원 퇴사 시 즉시 삭제.

## analytics

**책임**: 대시보드 집계, 시스템 진단.

- 함수: `getCompanyDashboardPayload`, `getAdminDashboardPayload`, `getSystemDiagnostics`, `getSystemStatus`
- 테이블: `health_score_snapshots` (customer와 공유)

## organization

**책임**: 회사 가입/탈퇴, 직원 초대·권한, 인증(카카오/네이버/구글/자체 로그인), 구독/결제, 관리자 감사로그.

- 함수: `resolveCompanyStaffDisplayName`, `getCompanyStaffMemberOptions`, `createCompanySignup`, `closeCompanyAccount`, `deleteCompanyPermanently`, `getCompanySettings`, `updateCompanySettings`, `getCompanyOriginAddress`, `getCompanyJobTitles`, `addCompanyJobTitle`, `removeCompanyJobTitle`, `createStaffInvitation`, `getStaffInvitationPreview`, `updateStaffInvitation`, `deleteStaffInvitation`, `getCompanyStaffInvitations`, `createStaffAccountDirect`, `acceptStaffKakaoInvitation`, `acceptStaffOAuthInvitation`, `createPersonalKakaoWorkspace`, `createPersonalOAuthWorkspace`, `linkOAuthIdentityToUser`, `getAuthCredentials`, `getFallbackAuthCredentials`, `upsertAuthCredentials`, `updateAdminPasswordHash`, `createPasswordResetRequest`, `consumePasswordReset`, `getManagedCompanyAccounts`, `upsertManagedCompanyAccount`, `listSubscriptionsForAdmin`, `getSubscription`, `getSubscriptionByCustomerKey`, `ensureSubscription`, `saveSubscriptionBillingKey`, `updateSubscriptionStatus`, `updateSubscriptionPlanAmount`, `chargeDueSubscriptions`, `listSubscriptionPayments`, `getAdminAuditLogs`
- 테이블: `companies`, `company_members`, `staff_invitations`, `subscriptions`, `subscription_payments`, `admin_audit_logs`, `auth_credentials`, `app_users`, `login_throttle_attempts`
- 관련 파일: `domains/organization/staff-display-name.ts`, `domains/organization/sensitive-access-log.ts`, `domains/organization/session-observation.ts`, `application/organization/observe-staff-session.ts`, `lib/store/07-sensitive-access-logs.ts`, `lib/store/07-session-observation.ts`, `lib/auth.ts`(테넌트 격리 중앙 함수 `getRequestAuthScope`), `lib/workspace.ts`(역할별 기능 권한), `lib/toss-payments.ts`, `lib/password.ts`

## 도메인 미분류(공용 인프라)

특정 도메인 소유가 아니라 여러 도메인이 공유하는 인프라 함수: `isProductionStoreConfigured`, `mapWithConcurrency`, `getUploadHistory`, `getExcelMappingPreset`, `upsertExcelMappingPreset`, `deleteExcelMappingPreset`, `sendBusinessClosureAlerts`(customer+lead 교차).

## pricing
가격표 P0: domains/pricing/price-rules.ts → application/pricing/manage-price-sheets.ts → lib/pricing/price-sheet-repository.ts. 가격표 원가/마진은 회사 대표·관리자에게만 제공하며 공개 견적·계약 단가를 수정하지 않는다. SQL은 docs/sql-drafts/20261030-pricing-p0.sql 초안만 작성한다.
