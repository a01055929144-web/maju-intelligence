import type { PriceQuery, PriceState } from "../../domains/pricing/price-rules";
export type PricingCommand =
  | { action: "group"; id?: string; name: string; margin: number; rounding: number }
  | { action: "category"; category: string; groupId: string }
  | { action: "defaults"; margin: number; rounding: number }
  | { action: "item-margin"; productId: string; margin: number | null }
  | { action: "assign"; productId: string; groupId: string }
  | { action: "direct"; productId: string; price: number | null }
  | { action: "recalculate" }
  | { action: "restore"; batchId: string };
export interface PriceSheetRepository {
  read(companyId: string, query?: PriceQuery): Promise<PriceState>;
  execute(companyId: string, command: PricingCommand): Promise<void>;
}
export function managePriceSheets(repository: PriceSheetRepository) {
  return {
    read: (companyId: string, query?: PriceQuery) => repository.read(companyId, query),
    execute: (companyId: string, command: PricingCommand) => repository.execute(companyId, command)
  };
}
