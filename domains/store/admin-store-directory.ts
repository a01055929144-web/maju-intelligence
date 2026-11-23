export type AdminStoreDuplicateInput = {
  id: string;
  storeName: string;
  businessNumber: string | null;
  address: string | null;
};

export function findAdminStoreDuplicateIds(stores: readonly AdminStoreDuplicateInput[]) {
  const groups = new Map<string, string[]>();
  for (const store of stores) {
    const keys = [
      store.businessNumber ? `business:${store.businessNumber.replace(/\D/g, "")}` : "",
      store.storeName && store.address ? `place:${normalize(store.storeName)}:${normalize(store.address)}` : "",
    ].filter(Boolean);
    for (const key of keys) groups.set(key, [...(groups.get(key) || []), store.id]);
  }
  return new Set(Array.from(groups.values()).filter((ids) => ids.length > 1).flat());
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[^0-9a-z가-힣]/g, "");
}
