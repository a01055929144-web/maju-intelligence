# `lib/store.ts` 분리 계획

작성 기준: 2026-11-15 main `6c2cfdf`. 이 문서는 코드 이동 없이 `lib/store.ts`를 읽어 만든 다음 차수용 설계서다.

## 조사 방법과 결론

- `export function`, `export async function`, `export const` 239개를 전부 추출했다.
- 아래 `화면/API`는 각 export를 직접 참조하는 화면(`app/**/page.tsx`, `components/**`)과 API 라우트(`app/api/**/route.ts`)의 파일 수다. 테스트, 스크립트, 다른 라이브러리와 store 내부 간접 호출은 세지 않았다.
- 타입은 함수와 함께 이동하되 기존 `lib/store.ts`가 다시 내보내도록 한다. 호출부 import 변경은 마지막 단계까지 미룬다.
- 가장 큰 결합점은 `supabaseRequest`(API 35개, 그 밖의 라이브러리·시험 113개 직접 참조)다. 먼저 옮기면 거의 전 저장소가 흔들리므로 마지막 공통 인프라 단계로 둔다.
- `store` 도메인에 남은 공개 함수는 0개다. 매장 회원·포털·원가 경계는 이미 `lib/store/*` 파일로 분리돼 있으므로 되돌려 합치지 않는다.

표기: `함수 (화면/API)`.

## 전체 export 배정표

### customer — 42개

`getCustomerMaster (0/2)`, `saveDeliveryHistoryFollowUp (0/1)`, `getCustomerMapSummaries (1/0)`, `filterCustomersByAssignment (0/0)`, `canAccessAssignedCustomer (0/12)`, `isCustomerOnTodayRouteForDriver (0/0)`, `upsertCustomerMaster (1/1)`, `getKakaoIndustryBackfillPreview (0/1)`, `listCustomerContacts (0/1)`, `upsertCustomerContact (0/2)`, `deleteCustomerContact (0/1)`, `syncCustomerGoogleReviews (0/2)`, `summarizeCustomerReviewText (0/1)`, `getBusinessNumberExceptions (1/1)`, `getExemptBusinessNumberSet (0/0)`, `addBusinessNumberException (0/1)`, `removeBusinessNumberException (0/1)`, `getCompanyJobTitles (1/1)`, `addCompanyJobTitle (0/1)`, `removeCompanyJobTitle (0/1)`, `getCustomerOperations (0/1)`, `getCustomerOperationsSummary (0/1)`, `addCustomerNote (0/1)`, `addCustomerAttachment (0/1)`, `uploadCustomerAttachmentFile (0/1)`, `createCustomerAttachmentSignedUrl (0/1)`, `getCustomerAttachmentOwnerByStoragePath (0/1)`, `normalizeNameForDuplicateCheck (0/0)`, `findDuplicateCustomerCandidates (0/1)`, `mergeDuplicateCustomers (1/1)`, `getChurnRiskCustomers (2/1)`, `bulkUpdateDeliveryManager (0/1)`, `bulkUpdateCustomerGradeOverride (0/0)`, `bulkUpdateDeliveryVehicle (0/1)`, `bulkClearDeliveryAssignment (0/1)`, `RELATIONSHIP_STATUS_ACTIVE (0/1)`, `RELATIONSHIP_STATUS_TERMINATED (0/1)`, `setCustomerRelationshipStatus (1/1)`, `refreshCustomerBusinessStatuses (0/1)`, `refreshAllCompaniesBusinessStatuses (0/1)`, `sendBusinessClosureAlerts (0/1)`, `sendDailyChurnRiskDigests (0/1)`.

### lead — 64개

`computePermitLeadPeriod (0/0)`, `ingestPermitLeadRows (0/1)`, `countRecentNewRestaurantLeads (0/1)`, `recordAllCompaniesDailyLeadTargetSnapshots (0/1)`, `getLeadSyncStatus (0/1)`, `syncGovRestaurantLeads (0/2)`, `syncAllCompaniesGovRestaurantLeads (0/2)`, `syncSeoulRestaurantLeads (0/1)`, `syncAllCompaniesSeoulRestaurantLeads (0/1)`, `getCompanyLeadSearchRegions (0/1)`, `getCompanySalesAreaState (1/1)`, `getCompanySalesAdministrativeAreas (0/2)`, `getCompanySalesAreaRecommendations (0/1)`, `countCompanyLeadsInAdministrativeArea (0/1)`, `getCompanySalesAreaMapStats (1/1)`, `isAddressInSalesAreas (0/0)`, `addCompanyLeadSearchRegion (0/1)`, `removeCompanyLeadSearchRegion (0/1)`, `getMapFilterPresets (0/1)`, `saveMapFilterPreset (0/1)`, `deleteMapFilterPreset (0/1)`, `runKakaoKeywordLeadSweep (0/2)`, `syncAllCompaniesKakaoKeywordLeads (0/1)`, `listLeadBusinessHours (0/0)`, `saveLeadBusinessHours (0/1)`, `listPermitLeads (2/1)`, `getPermitLeadQueues (0/1)`, `resolvePermitLeadStatus (0/0)`, `recordPermitLeadAction (0/0)`, `listPermitLeadActions (0/0)`, `linkKakaoToAppUser (0/1)`, `getAppUserMobilePhone (0/1)`, `getAppUserLoginMethods (0/0)`, `voidLeadAction (0/1)`, `listSalesContactLedger (3/0)`, `deletePermitLead (0/1)`, `recordLeadSourceDisclosureAudit (0/1)`, `hasSalesOutreachPolicyAcknowledgement (0/1)`, `acknowledgeSalesOutreachPolicy (0/1)`, `LEAD_DNC_WRITE_ENABLED (0/1)`, `listActiveLeadDoNotContacts (0/1)`, `registerLeadDoNotContact (0/1)`, `releaseLeadDoNotContact (0/1)`, `listLeadContactFieldSources (0/1)`, `LEAD_FIELD_SOURCE_WRITE_ENABLED (0/0)`, `recordLeadContactFieldSource (0/0)`, `getPermitLeadIdentityForCompany (0/1)`, `updatePermitLeadProfile (0/1)`, `enrichPermitLeadKeywordVolume (0/1)`, `buildLeadEnrichmentEventOutcome (0/0)`, `shouldAutoApplyKakaoPhone (0/0)`, `shouldClearKakaoPhoneOnReject (0/0)`, `isIndustryUnsettled (0/0)`, `isLeadGoogleEnrichmentEnabled (0/0)`, `enrichPermitLeadExternalInfo (0/1)`, `updatePermitLeadKakaoMatch (0/1)`, `enrichLeadsMissingContactInfo (0/1)`, `enrichAllCompaniesLeadsMissingContactInfo (0/1)`, `convertPermitLeadToCustomer (0/1)`, `getPermitLeadConversionPreview (0/1)`, `mapWithConcurrency (1/1)`, `findNearbyPermitLeads (0/2)`, `refreshPermitLeadRecommendationScores (1/1)`, `refreshAllCompaniesRecommendationScores (0/1)`.

### sales — 12개

`uploadSalesQuotePhoto (0/1)`, `createSalesQuote (0/1)`, `getSalesQuoteForEdit (1/1)`, `updateSalesQuote (0/1)`, `listSalesQuotes (2/0)`, `listPendingAcceptedQuotesForCustomer (0/1)`, `getPublicSalesQuote (1/1)`, `acceptSalesQuote (0/1)`, `getRevenuePipeline (1/1)`, `getSalesTransactions (1/2)`, `matchSalesTransactionsToCustomer (0/1)`, `getSalesAssistantDrafts (1/1)`.

### route — 9개

`saveRouteOrderConfirmation (0/1)`, `getTodayRoutePlan (2/3)`, `saveRouteDistanceCache (0/3)`, `listDeliveryRouteUnits (1/1)`, `saveDeliveryRouteUnit (0/1)`, `getStaffRouteUnitDisplay (0/0)`, `getDeliveryVehicleFuelTypes (1/1)`, `upsertDeliveryVehicleFuelType (0/1)`, `deleteDeliveryVehicleFuelType (0/1)`.

### delivery — 14개

`upsertStaffMobileLocation (0/1)`, `getStaffVehicleLocations (1/1)`, `getStaffLocationEvents (0/1)`, `getDeliveryCompletionEvents (1/1)`, `getDeliveryHistorySummary (0/1)`, `getDeliveryHistoryForDate (0/1)`, `purgeExpiredStaffLocationEvents (0/1)`, `getCustomerMessageLogs (0/1)`, `sendCustomerDeliveryMessage (0/1)`, `getCompanyOriginAddress (1/3)`, `leadActionRepository (0/2)`, `vehicleMasterRepository (2/1)`, `saveVisitResult (0/1)`, `getVisitTimeline (0/3)`.

### analytics — 15개

`getSystemStatus (0/0)`, `getSystemDiagnostics (1/3)`, `getSalesKpiSnapshot (0/1)`, `getCompanySalesKpiOverview (1/0)`, `updateCompanySalesKpiTarget (0/1)`, `saveAnalysis (0/1)`, `getLatestReport (1/1)`, `getReportById (1/0)`, `getLatestBriefing (0/1)`, `getLatestLeads (0/1)`, `updateLeadStatus (0/1)`, `getCompanyDashboardPayload (0/2)`, `getAdminDashboardPayload (1/1)`, `getUploadHistory (1/1)`, `getAdminAuditLogs (1/0)`.

### organization — 79개

`normalizeCompanyKind (0/0)`, `linkOAuthIdentityToUser (0/0)`, `getCustomerAuthConnections (0/0)`, `getSupabaseConfig (0/0)`, `supabaseRequest (0/35)`, `extractCustomerAdministrativeArea (0/1)`, `extractCustomerAdministrativeSubarea (0/0)`, `normalizeSelectableSalesArea (0/0)`, `resolveEffectiveSalesAreas (0/0)`, `assignCustomerByTerritory (0/0)`, `resolveNewCustomerStaffAssignment (0/0)`, `resolveExistingCustomerStaffAssignment (0/0)`, `groupRowsByColumnSignature (0/0)`, `getCompanyStaffMemberOptions (1/1)`, `getCustomerAssignmentOptionValues (1/0)`, `getDeliveryTerritories (1/1)`, `saveDeliveryTerritory (0/1)`, `supabaseStorageRequest (0/0)`, `isProductionStoreConfigured (0/1)`, `getExcelMappingPreset (0/1)`, `upsertExcelMappingPreset (0/1)`, `deleteExcelMappingPreset (0/1)`, `getFallbackAuthCredentials (0/0)`, `getAuthCredentials (1/1)`, `getAppUserLoginCredential (0/0)`, `getAppUserAccountState (0/0)`, `getManagedAdminAccountCount (0/0)`, `listManagedLoginAccounts (1/1)`, `createManagedLoginAccount (0/1)`, `updateManagedLoginAccount (0/1)`, `changeAppUserPassword (0/1)`, `upsertAuthCredentials (0/1)`, `getCustomerLoginCredentials (0/0)`, `isActiveLegacyOwnerSession (0/1)`, `updateCustomerUserLastLogin (0/0)`, `getCustomerWorkspaces (1/1)`, `leaveCustomerWorkspace (0/1)`, `updateAdminPasswordHash (0/0)`, `updateCustomerPasswordHash (0/0)`, `createPasswordResetRequest (0/1)`, `consumePasswordReset (0/1)`, `getManagedCompanyAccounts (5/1)`, `upsertManagedCompanyAccount (0/1)`, `createCompanySignup (0/1)`, `createStaffInvitation (0/2)`, `createStaffAccountDirect (0/1)`, `getCompanyStaffInvitations (2/1)`, `updateStaffInvitation (0/2)`, `deleteStaffInvitation (0/2)`, `getActiveCustomerMembership (0/0)`, `acceptStaffKakaoInvitation (0/1)`, `verifyInvitationPhoneLastFour (0/1)`, `getStaffInvitationPreview (1/1)`, `createPersonalKakaoWorkspace (0/1)`, `acceptStaffOAuthInvitation (0/2)`, `createPersonalOAuthWorkspace (0/2)`, `getCompanySettings (8/3)`, `updateCompanySettings (0/1)`, `getCompanyMessageTemplates (0/1)`, `getLeadDmSettings (0/1)`, `saveLeadDmSettings (0/1)`, `replaceCompanyMessageTemplates (0/1)`, `getDriverMessageTemplates (0/1)`, `replaceDriverMessageTemplates (0/1)`, `closeCompanyAccount (0/1)`, `setCompanyKind (0/1)`, `deleteCompanyPermanently (0/1)`, `makeCustomerKey (0/0)`, `sanitizeStorageFilename (0/0)`, `encodeStoragePath (0/0)`, `getSubscriptionByCustomerKey (0/1)`, `getSubscription (0/1)`, `ensureSubscription (0/1)`, `saveSubscriptionBillingKey (0/1)`, `updateSubscriptionPlanAmount (0/1)`, `updateSubscriptionStatus (0/1)`, `listSubscriptionPayments (0/1)`, `listSubscriptionsForAdmin (1/1)`, `chargeDueSubscriptions (1/2)`.

### pricing — 4개

`listProductCatalog (0/0)`, `listCustomerContractPrices (0/1)`, `getCustomerContractPrice (0/0)`, `closeCustomerContractPrice (0/1)`.

### store — 0개

남은 공개 함수 없음. 기존 `lib/store/06-*.ts`, `07-*.ts`, `08-*.ts`, `11-*.ts`, `store-costs.ts` 경계를 유지한다.

## 같이 옮겨야 하는 호출 묶음

| 묶음 | 함께 이동할 공개 함수 | 이유 |
| --- | --- | --- |
| Supabase 공통 | `getSupabaseConfig`, `supabaseRequest`, `supabaseStorageRequest`, `isProductionStoreConfigured`, `encodeStoragePath`, `sanitizeStorageFilename` | 거의 모든 도메인이 의존한다. 도메인 이동 중에는 원래 위치에 두고 마지막에 공통 infrastructure로 이동한다. |
| 회사·인증 | 로그인 계정, 비밀번호 재설정, OAuth 연결, workspace, 회사 계정, 직원 초대 관련 organization 함수 | 서로 `getCompanySettings`, 계정 상태, 감사 컨텍스트를 호출한다. 읽기/쓰기만 따로 떼면 순환 의존이 생긴다. |
| 배정·권역 | 주소 추출/정규화, `resolveEffectiveSalesAreas`, staff option, territory 조회·저장, 신규/기존 거래처 배정 | customer 저장과 route/store 주소 관리가 함께 사용한다. 순수 규칙을 먼저 domain으로, 조회·저장은 infrastructure로 나눈다. |
| 거래처 원장 | `getCustomerMaster`, assignment filter/access, `upsertCustomerMaster`, 예외 사업자번호, 메모·첨부·연락처 | 저장 시 배정·중복키·예외번호·감사 기록을 함께 사용한다. |
| 첨부 저장 | upload/signed URL/owner lookup, `addCustomerAttachment`, storage helpers | Storage 경로 인코딩과 DB 소유권 확인을 분리하면 권한 우회 위험이 있다. |
| 견적 | quote CRUD, public quote, pending acceptance, `acceptSalesQuote` | 공개 조회와 승인 RPC의 토큰·회사 경계를 같은 모듈 시험으로 고정해야 한다. |
| 리드 수집 | 정부·서울·카카오 동기화, ingest, sync status, daily target | 공통 upsert와 일일 스냅샷·동시성 제한을 공유한다. |
| 리드 접촉 | action/status, outreach policy, DNC, field source, disclosure audit | 수신거부·출처·정책 확인은 한 경계에서 유지해야 한다. |
| 리드 보강 | 외부 보강, 카카오 match, keyword volume, missing-contact backfill | 적용/거절과 출처 감사 이벤트가 함께 움직인다. |
| 리드 전환 | `convertPermitLeadToCustomer`, preview, customer assignment/upsert | lead/customer 교차 도메인 use case다. 양쪽 repository를 호출하는 application 계층으로 둔다. |
| 경로 | route plan/order confirmation/distance cache/route units/vehicle fuel | 오늘 경로와 차량·거리 캐시의 회사/기사 범위를 공유한다. |
| 거래·중복 | sales transactions, match, duplicate candidates/merge, bulk assignment | 거래처 병합 시 매출·메모·첨부 이동과 삭제가 한 작업이다. |
| 구독 | subscription 조회·보장·billing key·금액·상태·결제 목록·정기 청구 | 결제 상태 전이가 연결돼 있어 한 번에 옮기고 별도 billing 하위 모듈로 둔다. |

## 권장 이동 순서

1. **순수 함수만**: 주소/이름 정규화, 기간 계산, 상태 결정, 파일명/경로 정리. 기존 경로에서 재수출하고 단위 시험만 이동한다.
2. **호출이 적은 읽기 전용 모듈**: pricing 계약 가격, analytics 보고서 조회, sales 공개 견적 조회. UI/API 직접 호출이 0~2개인 것부터 한다.
3. **route·delivery 읽기/쓰기**: route unit과 차량 연료 → 위치/완료 이벤트 → 오늘 경로 순서. 각 PR은 한 묶음만 이동한다.
4. **sales·pricing**: 견적 CRUD와 승인 RPC를 분리하지 말고 같이 옮긴 뒤, 거래 원장·매칭을 다음 PR로 옮긴다.
5. **customer**: 연락처/리뷰 → 메모/첨부 → 원장 조회 → 원장 저장·중복 병합 순서. `canAccessAssignedCustomer`는 API 12개가 의존하므로 마지막이다.
6. **lead**: 지도 preset 같은 독립 묶음 → 수집 → 접촉/DNC → 보강 → customer 전환 순서.
7. **organization**: 설정/메시지 → 직원 초대 → 계정/OAuth → 회사 생성·삭제 → 구독 순서. 인증과 회사 생명주기는 각각 독립 PR로 둔다.
8. **공통 Supabase infrastructure**: 모든 도메인이 새 repository를 쓰고 난 뒤 마지막으로 `supabaseRequest` 계열을 이동한다. 이 단계 전까지는 호환 재수출을 삭제하지 않는다.
9. **마감**: `lib/store.ts`를 재수출 전용 barrel로 만든 뒤 호출부 import를 도메인별로 점진 변경한다. 한 PR에서 barrel 삭제와 전체 import 변경을 같이 하지 않는다.

각 이동 PR은 원본 함수와 새 함수가 동시에 존재하지 않게 “이동 + 원래 경로 재수출”만 하고, 기능 변경·쿼리 변경·이름 변경은 섞지 않는다.

## 위험과 이동 게이트

### RLS·회사 범위

- 모든 `company_id` 필터와 `canAccessAssignedCustomer` 호출을 그대로 보존한다. repository가 회사 ID를 선택 인자로 바꾸거나 UI 입력을 신뢰하게 만들지 않는다.
- `supabaseRequest`는 service key를 쓸 수 있어 RLS 자체가 마지막 방어선이 아닐 수 있다. URL 필터와 RPC 인자를 스냅샷 시험으로 고정한다.
- 공개 견적, 직원 초대, 비밀번호 재설정, OAuth 연결은 토큰/nonce와 회사 범위를 함께 옮긴다.

### 트랜잭션·원자성

- `acceptSalesQuote`, `closeCustomerContractPrice`, lead DNC 3종, `voidLeadAction`, enrichment due-list, atomic customer import는 RPC 이름과 payload를 바꾸지 않는다.
- `mergeDuplicateCustomers`, `convertPermitLeadToCustomer`, 회사/직원 생성·삭제, 구독 청구는 여러 행·테이블을 건드린다. 현재 보상 삭제나 순차 쓰기가 있다면 이동만 하고 원자화는 별도 DB 승인 작업으로 분리한다.
- 이동 전후에 성공뿐 아니라 중간 실패 시 남는 행을 비교하는 시험이 있어야 한다.

### 감사 기록

- `upsertAuthCredentials`, 회사/직원/거래처 쓰기, 사업자번호 예외, 직책, `saveAnalysis`, 회사 종료·영구 삭제의 actor/role/metadata를 그대로 유지한다.
- `deleteCompanyPermanently`는 회사 삭제 전에 감사를 남기고 FK가 `company_id`를 null 처리하는 순서를 바꾸면 안 된다.
- 감사 저장 실패를 무시하도록 새 catch를 추가하지 않는다. 현재 best-effort인 경로는 그 사실을 시험과 문서에 남긴다.

### PR별 완료 조건

- 이동한 export 목록과 직접 호출 파일 수가 전후 동일.
- typecheck, lint, 전체 Vitest, build, auth-boundary 통과.
- SQL/RPC 문자열, 테이블명, 회사 필터, 감사 payload의 diff가 0.
- 순환 import가 없고 domain은 React·`lib/store.ts`를 import하지 않음.
- 운영 DB 적용·데이터 변경·기능 플래그·배포 없음.
