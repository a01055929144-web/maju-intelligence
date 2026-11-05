export type CostProduct = {
  id: string;
  code: string;
  name: string;
  spec: string;
  unit: string;
  cost: number;
  createdAt?: string;
  taxType?: "taxable" | "exempt";
  supplierProductId?: string;
  supplierCode?: string;
  supplierName?: string;
  /** 매입처 상품이 기억하는 엑셀 원문 키(원문 상품명|규격|단위). 이름을 고쳐도 원문으로 다시 찾습니다. */
  supplierRawKey?: string;
};

export type PurchaseCostCandidate = {
  productId: string;
  supplierProductId: string;
  supplierName: string;
  cost: number;
  direction: "increase" | "decrease" | "review";
  reviewReason?: string;
};

export function selectPurchaseCostCandidate(
  productId: string,
  currentCost: number,
  suppliers: readonly { id: string; supplierName: string; latestCost: number | null; confirmed: boolean }[]
): PurchaseCostCandidate | null {
  const selected = suppliers
    .filter((supplier) => supplier.confirmed && supplier.latestCost != null && Number.isFinite(supplier.latestCost) && supplier.latestCost > 0)
    .sort((a, b) => Number(a.latestCost) - Number(b.latestCost) || a.id.localeCompare(b.id))[0];
  if (!selected || selected.latestCost === currentCost) return null;
  return {
    productId,
    supplierProductId: selected.id,
    supplierName: selected.supplierName,
    cost: Number(selected.latestCost),
    direction: Number(selected.latestCost) > currentCost ? "increase" : "decrease"
  };
}

export type CostImportRow = {
  code: string;
  name: string;
  spec: string;
  unit: string;
  supplier: string;
  cost: number;
};

const normalized = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g, "").trim();

export function matchCostImportRow(row: CostImportRow, products: readonly CostProduct[]) {
  const supplier = normalized(row.supplier);
  const choices = supplier ? products.filter((product) => !product.supplierName || normalized(product.supplierName) === supplier) : products;
  const code = normalized(row.code);
  const byCode = code ? choices.filter((product) => [product.supplierCode, product.code].some((value) => value && normalized(value) === code)) : [];
  if (byCode.length === 1) return byCode[0];
  if (byCode.length > 1) return null;
  const name = normalized(row.name);
  const spec = normalized(row.spec);
  const byName = choices.filter((product) => normalized(product.name) === name && normalized(product.spec) === spec);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1 && new Set(byName.map((product) => product.id)).size === 1) {
    return { ...byName[0], supplierProductId: undefined, supplierCode: undefined, supplierName: undefined };
  }
  if (byName.length) return null;
  // 11/4: 매일 올려도 같은 품목이 새로 생기지 않도록 이름+규격을 괄호·띄어쓰기 없이 한 번 더 비교합니다.
  const key = looseKey(`${row.name}${row.spec}`);
  if (!key) return null;
  const byKey = choices.filter((product) => looseKey(`${product.name}${product.spec}`) === key);
  if (byKey.length === 1) return byKey[0];
  if (byKey.length > 1 && new Set(byKey.map((product) => product.id)).size === 1) {
    return { ...byKey[0], supplierProductId: undefined, supplierCode: undefined, supplierName: undefined };
  }
  return null;
}

const looseKey = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko").replace(/[\s_\-./()[\]]/g, "");

export function parseCostImportRows(rows: readonly Record<string, unknown>[], mapping: Record<keyof CostImportRow, string>) {
  return rows.map((row, index) => {
    const read = (key: keyof CostImportRow) => String(row[mapping[key]] ?? "").trim();
    const costText = read("cost").replaceAll(",", "");
    const cost = Number(costText);
    if (!read("name") || !costText || !Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000) throw new Error(`${index + 2}행의 품목명·매입가를 확인해 주세요.`);
    return { code: read("code"), name: read("name"), spec: read("spec"), unit: read("unit"), supplier: read("supplier"), cost };
  });
}

/** 11/4: 엑셀 원문 키 — 원문 상품명(대괄호 포함 그대로)·규격·단위. */
export function aliasKey(rawName: string, spec = "", unit = "") {
  return [rawName, spec, unit].map((value) => looseKey(value)).join("|");
}

/** 한 번 연결한 원문이면 이름이 달라도 같은 상품으로 붙입니다. */
export function matchByAlias(key: string, supplier: string, products: readonly CostProduct[]) {
  if (!key.replaceAll("|", "")) return null;
  const supplierKey = normalized(supplier);
  const hits = products.filter((product) => product.supplierRawKey === key && (!supplierKey || !product.supplierName || normalized(product.supplierName) === supplierKey));
  if (!hits.length) return null;
  return new Set(hits.map((product) => product.id)).size === 1 ? hits[0] : null;
}

function bigrams(value: string) {
  const text = looseKey(value);
  const set = new Set<string>();
  for (let index = 0; index < text.length - 1; index++) set.add(text.slice(index, index + 2));
  if (text.length === 1) set.add(text);
  return set;
}

export function nameSimilarity(a: string, b: string) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  left.forEach((gram) => { if (right.has(gram)) common++; });
  return (2 * common) / (left.size + right.size);
}

export type DuplicateSuspect = { productId: string; name: string; spec: string; unit: string; reason: string; score: number };

/**
 * 11/4: 새 상품처럼 보이지만 기존 상품일 수 있는 것.
 * - 이름은 같은데 규격·단위만 다름 → '규격·단위 변경?'
 * - 이름이 비슷함(글자 쌍 겹침 60% 이상) → '이름 비슷'
 */
export function findDuplicateSuspects(row: { name: string; spec: string; unit: string }, products: readonly CostProduct[], limit = 3): DuplicateSuspect[] {
  const seen = new Set<string>();
  const out: DuplicateSuspect[] = [];
  const rowName = looseKey(row.name);
  for (const product of products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    const sameName = looseKey(product.name) === rowName;
    const score = sameName ? 1 : nameSimilarity(row.name, product.name);
    if (score < 0.6) continue;
    const diffs = [
      looseKey(product.spec) !== looseKey(row.spec) ? `규격 ${product.spec || "없음"} → ${row.spec || "없음"}` : "",
      looseKey(product.unit) !== looseKey(row.unit) ? `단위 ${product.unit || "없음"} → ${row.unit || "없음"}` : ""
    ].filter(Boolean);
    const reason = sameName ? (diffs.length ? `이름 같음 · ${diffs.join(" · ")}` : "같은 상품") : `이름 비슷 ${Math.round(score * 100)}%${diffs.length ? ` · ${diffs.join(" · ")}` : ""}`;
    out.push({ name: product.name, productId: product.id, reason, score, spec: product.spec, unit: product.unit });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
