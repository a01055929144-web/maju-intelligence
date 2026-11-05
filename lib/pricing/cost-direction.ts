import { supabaseRequest } from "@/lib/store";
import { publicCostDirection, type CostDirection } from "../../domains/pricing/cost-direction";

export function costDirectionEnabled() {
  return process.env.STORE_PURCHASE_COST_DIRECTION_ENABLED === "true";
}

/** Only the approved SQL projection is read; raw purchase records stay on the server. */
export async function readCostDirections(companyId: string, optedIn: boolean, productIds: string[]) {
  const directions = new Map<string, CostDirection>();
  if (!costDirectionEnabled() || !optedIn || !productIds.length) return directions;
  const rows = await supabaseRequest<Array<{ product_id: string; sales_unit: string; direction: unknown }>>(
    "rpc/storefront_cost_directions", {
      method: "POST", body: JSON.stringify({ p_company: companyId, p_products: productIds }),
    },
  );
  const allowed = new Set(productIds);
  for (const row of rows) {
    const direction = publicCostDirection(row.direction);
    if (direction && allowed.has(row.product_id) && typeof row.sales_unit === "string")
      directions.set(`${row.product_id}:${row.sales_unit}`, direction);
  }
  return directions;
}
