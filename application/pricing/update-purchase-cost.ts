export type PurchaseCostChange = {
  productId: string;
  supplierProductId?: string;
  expectedCost: number;
  cost: number;
  fileName?: string;
};

export interface PurchaseCostRepository {
  list(companyId: string): Promise<unknown>;
  save(companyId: string, actorName: string, change: PurchaseCostChange): Promise<void>;
}

export function updatePurchaseCosts(repository: PurchaseCostRepository) {
  return {
    list: repository.list,
    async save(companyId: string, actorName: string, changes: PurchaseCostChange[]) {
      if (!Array.isArray(changes) || !changes.length || changes.length > 100) throw new Error("1~100개 품목을 선택해 주세요.");
      for (const change of changes) {
        if (![change.cost, change.expectedCost].every((value) => Number.isFinite(value) && value >= 0 && value <= 1_000_000_000 && Number(value.toFixed(2)) === value)) throw new Error("매입가는 0~10억원, 소수 둘째 자리까지 입력해 주세요.");
      }
      let saved = 0;
      for (const change of changes) {
        try { await repository.save(companyId, actorName, change); saved++; }
        catch (error) { throw new Error(`${saved}개 저장됨 · ${changes.length - saved}개 미저장. ${error instanceof Error ? error.message : "다시 시도해 주세요."}`); }
      }
      return { saved };
    },
  };
}
