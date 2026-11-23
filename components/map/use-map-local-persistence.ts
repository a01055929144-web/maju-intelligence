import { useEffect, useState } from "react";

import { localStoreKeys } from "@/components/map/local-store-keys";
import type { StoreAttachment, StoreEdit, StoreHistoryItem } from "@/components/map/map-place-helpers";
import type { VehicleEdit } from "@/components/map/vehicle-helpers";
import { readLocalJson, saveLocalJson } from "@/lib/route-map-utils";

// 2026-08-28 피드백 대응: storeEdits/vehicleEdits는 이 브라우저에서만 유지되는 "서버 저장 전까지의
// 임시 낙관적 캐시"인데, 지우는 로직이 없어 한 번 저장되면 영구히 남아 있었습니다. 실제 서버 값이
// 나중에 다른 경로(다른 기기, 관리자 도구 등)로 바뀌어도 이 브라우저는 계속 옛 값을 보여주는
// 문제가 있었습니다. 완전한 해결(저장 성공 시 즉시 제거)은 현재 화면이 서버 재조회 없이 이 캐시에만
// 의존해 렌더링하는 구조상 화면이 원래 값으로 되돌아가 보이는 부작용이 있어, 대신 TTL(48시간)을 둬서
// "최소한 며칠 넘게 어긋난 채로 남아있지는 않게" 합니다.
const EDIT_CACHE_TTL_MS = 48 * 60 * 60 * 1000;

function loadEditCacheWithTtl<T>(valueKey: string, savedAtKey: string): { values: Record<string, T>; savedAt: Record<string, number> } {
  const values = readLocalJson<Record<string, T>>(valueKey, {});
  const savedAt = readLocalJson<Record<string, number>>(savedAtKey, {});
  const now = Date.now();
  const freshValues: Record<string, T> = {};
  const freshSavedAt: Record<string, number> = {};
  for (const [id, value] of Object.entries(values)) {
    const timestamp = savedAt[id];
    // 이 기능 배포 이전에 저장돼 저장 시각 기록이 없는 값은 일단 유지하되, 지금 시각으로 새로
    // 기록해 이후부터는 TTL이 정상 적용되게 합니다.
    if (timestamp && now - timestamp > EDIT_CACHE_TTL_MS) continue;
    freshValues[id] = value;
    freshSavedAt[id] = timestamp || now;
  }
  return { values: freshValues, savedAt: freshSavedAt };
}

// 지도 화면이 이 브라우저(localStorage)에 보관하는 거래처·배송차 편집값과 저장 effect 묶음(D-6 ⑤, 동작 변화 0).
export function useMapLocalPersistence() {
  const [storeAttachments, setStoreAttachments] = useState<Record<string, StoreAttachment>>(() => readLocalJson(localStoreKeys.attachments, {}));
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>(
    () => loadEditCacheWithTtl<StoreEdit>(localStoreKeys.storeEdits, localStoreKeys.storeEditsSavedAt).values
  );
  const [storeEditsSavedAt, setStoreEditsSavedAt] = useState<Record<string, number>>(
    () => loadEditCacheWithTtl<StoreEdit>(localStoreKeys.storeEdits, localStoreKeys.storeEditsSavedAt).savedAt
  );
  const [storeHistories, setStoreHistories] = useState<Record<string, StoreHistoryItem[]>>(() => readLocalJson(localStoreKeys.histories, {}));
  const [vehicleEdits, setVehicleEdits] = useState<Record<string, VehicleEdit>>(
    () => loadEditCacheWithTtl<VehicleEdit>(localStoreKeys.vehicleEdits, localStoreKeys.vehicleEditsSavedAt).values
  );
  const [vehicleEditsSavedAt, setVehicleEditsSavedAt] = useState<Record<string, number>>(
    () => loadEditCacheWithTtl<VehicleEdit>(localStoreKeys.vehicleEdits, localStoreKeys.vehicleEditsSavedAt).savedAt
  );
  const [manualDrivers, setManualDrivers] = useState<string[]>(() => readLocalJson(localStoreKeys.manualDrivers, []));
  // 배송차는 담당자와 별개로 지정될 수 있어(같은 트럭을 여러 담당자가 나눠 쓰거나, 한 담당자가
  // 상황에 따라 다른 차량을 몰 수 있음), 아직 어떤 거래처에도 배정되지 않은 배송차 이름을 미리
  // 등록해 두는 목록입니다. manualDrivers와 동일한 로컬 저장 방식을 씁니다.
  const [manualVehicles, setManualVehicles] = useState<string[]>(() => readLocalJson(localStoreKeys.manualVehicles, []));

  useEffect(() => saveLocalJson(localStoreKeys.attachments, storeAttachments), [storeAttachments]);
  useEffect(() => saveLocalJson(localStoreKeys.histories, storeHistories), [storeHistories]);
  useEffect(() => saveLocalJson(localStoreKeys.storeEdits, storeEdits), [storeEdits]);
  useEffect(() => saveLocalJson(localStoreKeys.storeEditsSavedAt, storeEditsSavedAt), [storeEditsSavedAt]);
  useEffect(() => saveLocalJson(localStoreKeys.vehicleEdits, vehicleEdits), [vehicleEdits]);
  useEffect(() => saveLocalJson(localStoreKeys.vehicleEditsSavedAt, vehicleEditsSavedAt), [vehicleEditsSavedAt]);
  useEffect(() => saveLocalJson(localStoreKeys.manualDrivers, manualDrivers), [manualDrivers]);
  useEffect(() => saveLocalJson(localStoreKeys.manualVehicles, manualVehicles), [manualVehicles]);

  return {
    manualDrivers,
    manualVehicles,
    setManualDrivers,
    setManualVehicles,
    setStoreAttachments,
    setStoreEdits,
    setStoreEditsSavedAt,
    setStoreHistories,
    setVehicleEdits,
    setVehicleEditsSavedAt,
    storeAttachments,
    storeEdits,
    storeEditsSavedAt,
    storeHistories,
    vehicleEdits,
    vehicleEditsSavedAt
  };
}
