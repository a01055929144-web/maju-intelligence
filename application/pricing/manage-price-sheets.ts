import { needsRecalculation, type PriceState } from "../../domains/pricing/price-rules";
export type PricingCommand =
  | { action: "group"; id?: string; name: string; margin: number; rounding: number }
  | { action: "assign"; productId: string; groupId: string }
  | { action: "direct"; productId: string; price: number | null }
  | { action: "recalculate" }
  | { action: "restore"; batchId: string };
export interface PriceSheetRepository {
  read(companyId: string): Promise<PriceState>;
  execute(companyId: string, command: PricingCommand): Promise<void>;
}
export function managePriceSheets(repository: PriceSheetRepository) {
  return {
    async read(companyId: string) {
      const state = await repository.read(companyId);
      return { ...state, pendingCount: state.items.filter(i => needsRecalculation(i, state.groups)).length };
    },
    async execute(companyId: string, command: PricingCommand) {
      await repository.execute(companyId, command);
    }
  };
}
