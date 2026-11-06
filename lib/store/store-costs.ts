import "server-only";

import { supabaseRequest } from "../store";

const PAGE_SIZE = 50;

export type StoreCostItem = {
  costKrw: number;
  effectiveOn: string;
  id: string;
  productName: string;
  revision: number;
  specification: string;
  unit: string;
};

export type StoreCostRow = Omit<StoreCostItem, "id" | "revision">;

type StoreCostDbRow = {
  cost_krw: number;
  effective_on: string;
  id: string;
  product_name: string;
  revision: number;
  specification: string;
  unit: string;
};

function mapRow(row: StoreCostDbRow): StoreCostItem {
  return {
    costKrw: Number(row.cost_krw),
    effectiveOn: row.effective_on,
    id: row.id,
    productName: row.product_name,
    revision: row.revision,
    specification: row.specification,
    unit: row.unit
  };
}

export async function listStoreCosts(input: {
  companyId: string;
  from?: string;
  offset?: number;
  product?: string;
  storeAccountId: string;
  to?: string;
}) {
  const filters = [
    `company_id=eq.${encodeURIComponent(input.companyId)}`,
    `store_account_id=eq.${encodeURIComponent(input.storeAccountId)}`,
    input.from ? `effective_on=gte.${encodeURIComponent(input.from)}` : "",
    input.to ? `effective_on=lte.${encodeURIComponent(input.to)}` : "",
    input.product ? `product_name=ilike.*${encodeURIComponent(input.product)}*` : ""
  ].filter(Boolean).join("&");
  const rows = await supabaseRequest<StoreCostDbRow[]>(
    `store_cost_items?select=id,product_name,specification,unit,effective_on,cost_krw,revision&${filters}` +
      `&order=effective_on.desc,product_name.asc,id.asc&limit=${PAGE_SIZE + 1}&offset=${input.offset ?? 0}`
  );
  return { hasMore: rows.length > PAGE_SIZE, rows: rows.slice(0, PAGE_SIZE).map(mapRow) };
}

export async function listStoreCostHistory(input: {
  companyId: string;
  itemId: string;
  offset?: number;
  storeAccountId: string;
}) {
  const rows = await supabaseRequest<StoreCostDbRow[]>(
    `store_cost_revisions?select=id,product_name,specification,unit,effective_on,cost_krw,revision` +
      `&company_id=eq.${encodeURIComponent(input.companyId)}` +
      `&store_account_id=eq.${encodeURIComponent(input.storeAccountId)}` +
      `&store_cost_item_id=eq.${encodeURIComponent(input.itemId)}` +
      `&order=revision.desc,id.desc&limit=${PAGE_SIZE + 1}&offset=${input.offset ?? 0}`
  );
  return { hasMore: rows.length > PAGE_SIZE, rows: rows.slice(0, PAGE_SIZE).map(mapRow) };
}

export async function updateStoreCost(input: {
  actorMemberId: string;
  companyId: string;
  expectedRevision: number;
  itemId: string;
  row: StoreCostRow;
  storeAccountId: string;
}) {
  const existing = await supabaseRequest<Array<{ product_key: string }>>(
    `store_cost_items?select=product_key&company_id=eq.${encodeURIComponent(input.companyId)}` +
      `&store_account_id=eq.${encodeURIComponent(input.storeAccountId)}` +
      `&id=eq.${encodeURIComponent(input.itemId)}&limit=1`
  );
  if (!existing[0]) throw new Error("store_cost_item_not_found");
  return supabaseRequest<{ id: string; replayed: boolean; revision: number }>("rpc/save_store_cost", {
    method: "POST",
    body: JSON.stringify({
      p_actor_member_id: input.actorMemberId,
      p_company_id: input.companyId,
      p_cost_krw: input.row.costKrw,
      p_effective_on: input.row.effectiveOn,
      p_expected_revision: input.expectedRevision,
      p_item_id: input.itemId,
      p_product_key: existing[0].product_key,
      p_product_name: input.row.productName,
      p_specification: input.row.specification,
      p_store_account_id: input.storeAccountId,
      p_unit: input.row.unit
    })
  });
}
