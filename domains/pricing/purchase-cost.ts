export type CostProduct = {
  id: string;
  code: string;
  name: string;
  spec: string;
  unit: string;
  cost: number;
  taxType?: "taxable" | "exempt";
  supplierProductId?: string;
  supplierCode?: string;
  supplierName?: string;
};

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
