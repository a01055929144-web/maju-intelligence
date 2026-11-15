// 지도 화면 로컬 저장소 키(브라우저 localStorage). 견적 임시저장 등이 같이 쓴다.
export const QUOTE_DRAFT_UPDATED_EVENT = "maju:quote-draft-updated";

export const localStoreKeys = {
  attachments: "maju:sales-route:attachments",
  deliveryProofs: "maju:sales-route:delivery-proofs",
  histories: "maju:sales-route:histories",
  manualDrivers: "maju:sales-route:manual-drivers",
  manualVehicles: "maju:sales-route:manual-vehicles",
  quoteDrafts: "maju:sales-route:quote-drafts",
  storeEdits: "maju:sales-route:store-edits",
  // 2026-08-28 피드백 대응(localStorage 편집 캐시가 서버 값과 영구히 어긋날 수 있음): 각 편집
  // 항목이 저장된 시각을 별도로 기록해, 오래된(48시간 이상) 항목은 다음 로딩 때 자동으로 정리합니다.
  storeEditsSavedAt: "maju:sales-route:store-edits-saved-at",
  vehicleEdits: "maju:sales-route:vehicle-edits",
  vehicleEditsSavedAt: "maju:sales-route:vehicle-edits-saved-at"
};
