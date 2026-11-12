import { supabaseRequest } from "../store";

// CC-30b: 매장 개별 가격 = customer_price_agreements 중 source_quote_id가 없는 행. 견적 수락으로 생긴 가격은 건드리지 않는다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;

export class StorePriceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const kstDay = (offsetDays = 0) => new Date(Date.now() + 9 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);

type Agreement = { id: string; source_quote_id: string | null; effective_from: string; sales_unit: string };

/**
 * 이 매장의 한 상품 가격을 정하거나(price 있음) 끝낸다(price = null).
 * - 단위·과세 칸은 상품 기본값. 단위·과세가 없는 상품은 거부.
 * - 이미 있는 이 매장 가격은 먼저 끝낸다(오늘 시작분은 취소, 그 밖은 어제까지) — DB가 같은 상품의 기간 겹침을 막는다.
 * - 견적서 수락으로 생긴 가격(source_quote_id 있음)은 덮어쓰지 않고 거부 — 먼저 거래처 상세에서 종료.
 */
export async function setStorePrice(companyId: string, customerId: string, productId: string, price: number | null, actorName?: string | null) {
  if (!UUID.test(customerId) || !UUID.test(productId)) throw new StorePriceError("매장과 상품을 확인해 주세요.");
  if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000_000)) throw new StorePriceError("가격은 0원 이상의 원 단위 숫자로 입력해 주세요.");
  const company = enc(companyId);
  const [customer] = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&company_id=eq.${company}&id=eq.${customerId}&limit=1`);
  if (!customer) throw new StorePriceError("이 회사의 매장이 아닙니다.", 404);
  const [product] = await supabaseRequest<Array<{ id: string; sales_unit: string | null; tax_type: string | null }>>(`product_catalog?select=id,sales_unit,tax_type&company_id=eq.${company}&id=eq.${productId}&is_active=eq.true&limit=1`);
  if (!product) throw new StorePriceError("이 회사의 판매 중인 상품이 아닙니다.", 404);
  // 끝내기 전에 먼저 확인 — 검증에 걸려 기존 가격만 끝나는 일이 없게.
  if (price !== null && (!product.sales_unit?.trim() || (product.tax_type !== "taxable" && product.tax_type !== "exempt"))) throw new StorePriceError("상품의 판매 단위·과세 구분을 먼저 정해 주세요.");
  const active = await supabaseRequest<Agreement[]>(`customer_price_agreements?select=id,source_quote_id,effective_from,sales_unit&company_id=eq.${company}&customer_id=eq.${customerId}&product_catalog_id=eq.${productId}&status=eq.active`);
  if (active.some((row) => row.source_quote_id)) throw new StorePriceError("견적서 수락으로 만든 가격이 있습니다. 거래처 상세에서 먼저 종료해 주세요.", 409);
  const today = kstDay(), now = new Date().toISOString();
  for (const row of active) {
    const body = row.effective_from >= today
      ? { status: "cancelled", ended_at: now, ended_by_name: actorName || null, updated_at: now }
      : { status: "ended", effective_until: kstDay(-1), ended_at: now, ended_by_name: actorName || null, updated_at: now };
    await supabaseRequest(`customer_price_agreements?company_id=eq.${company}&id=eq.${row.id}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
  }
  if (price === null) return { ended: active.length, created: false };
  await supabaseRequest("customer_price_agreements", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: companyId, customer_id: customerId, product_catalog_id: productId, sales_unit: product.sales_unit!.trim(), unit_price: price, tax_type: product.tax_type, price_includes_tax: false, effective_from: today, effective_until: null, status: "active", created_by_name: actorName || null }),
  });
  return { ended: active.length, created: true };
}
