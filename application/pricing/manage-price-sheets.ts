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
export type PricingBulkCommand =
  | { action: "bulk-margin"; productIds: string[]; margin: number | null }
  | { action: "bulk-direct"; productIds: string[]; price: number | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 11/4: 여러 품목에 같은 마진(또는 직접 단가 해제)을 한 번에. 품목별 명령을 4개씩 나눠 실행합니다. */
export function parseBulkCommand(input: unknown): PricingBulkCommand | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  if (body.action !== "bulk-margin" && body.action !== "bulk-direct") return null;
  const ids = Array.isArray(body.productIds) ? Array.from(new Set(body.productIds.map(String))) : [];
  if (!ids.length || ids.length > 300 || ids.some((id) => !UUID.test(id))) throw new Error("품목을 1~300개 선택해 주세요.");
  if (body.action === "bulk-margin") {
    const margin = body.margin === null ? null : Number(body.margin);
    if (margin !== null && (!Number.isFinite(margin) || margin < 0 || margin > 1000)) throw new Error("마진율은 0~1000% 사이로 입력해 주세요.");
    return { action: "bulk-margin", productIds: ids, margin: margin === null ? null : Math.round(margin * 100) / 100 };
  }
  if (body.price !== null) throw new Error("직접 단가는 한 번에 해제만 할 수 있습니다.");
  return { action: "bulk-direct", productIds: ids, price: null };
}
export function managePriceSheets(repository: PriceSheetRepository) {
  return {
    read: (companyId: string, query?: PriceQuery) => repository.read(companyId, query),
    execute: (companyId: string, command: PricingCommand) => repository.execute(companyId, command),
    async bulk(companyId: string, command: PricingBulkCommand, run: (items: readonly string[], task: (id: string) => Promise<void>) => Promise<unknown>) {
      await run(command.productIds, (productId) =>
        repository.execute(companyId, command.action === "bulk-margin" ? { action: "item-margin", productId, margin: command.margin } : { action: "direct", productId, price: null })
      );
    }
  };
}
