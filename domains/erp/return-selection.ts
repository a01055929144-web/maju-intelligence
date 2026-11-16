export type ReturnableLine = { id?: string; productCatalogId?: string; supplierProductId?: string; productCode?: string; productName?: string; specification?: string; unit?: string; quantity: number };
export type ReturnSelection = { lineId: string; quantity: number };

function lineKey(line: ReturnableLine) {
  return line.productCatalogId
    ? `catalog:${line.productCatalogId}`
    : line.supplierProductId
      ? `supplier:${line.supplierProductId}`
      : [line.productCode, line.productName, line.specification, line.unit].map((value) => value?.trim() || "").join("|");
}

export function remainingReturnLines<T extends ReturnableLine>(original: T[], returned: ReturnableLine[]) {
  const used = new Map<string, number>();
  for (const line of returned) used.set(lineKey(line), (used.get(lineKey(line)) || 0) + Number(line.quantity));
  return original.map((line) => ({ ...line, quantity: Math.max(0, Number(line.quantity) - (used.get(lineKey(line)) || 0)) }));
}

export function selectReturnLines<T extends ReturnableLine>(lines: T[], selections: ReturnSelection[]) {
  if (!selections.length) throw new Error("반품할 품목을 선택해 주세요.");
  const selected = new Map(selections.map((item) => [item.lineId, item.quantity]));
  if (selected.size !== selections.length) throw new Error("반품 품목이 중복되었습니다.");
  const result = lines.flatMap((line) => {
    if (!line.id || !selected.has(line.id)) return [];
    const quantity = selected.get(line.id)!;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > line.quantity)
      throw new Error("반품 수량은 원 수량보다 클 수 없습니다.");
    selected.delete(line.id);
    return [{ ...line, quantity }];
  });
  if (selected.size) throw new Error("원전표에 없는 품목은 반품할 수 없습니다.");
  return result;
}
