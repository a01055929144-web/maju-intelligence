import type { CustomerItemsWriter } from "../application/customer/import-customer-items";
import { supabaseRequest } from "./store";
import { createHash } from "node:crypto";
import { prepareCustomerItemFile, type CustomerItemReferences } from "../application/customer/prepare-customer-item-file";
import { CustomerItemImportError } from "../domains/customer/customer-item-import";
import { isFeatureEnabled } from "./feature-flags";

/** Enable only after approved schema application and readiness verification. */
export function customerItemsImportEnabled(companyId?: string | null) {
  return isFeatureEnabled("CUSTOMER_ITEMS_IMPORT", companyId);
}

export function customerItemsFileImportEnabled(companyId?: string | null) {
  return customerItemsImportEnabled(companyId) && isFeatureEnabled("PRODUCT_IMPORT_AUDIT_V2", companyId)
    && isFeatureEnabled("IMPORT_ROW_EDITOR", companyId) && isFeatureEnabled("PRODUCT_IMPORT_TARGETS", companyId);
}

export async function customerItemReferences(companyId: string): Promise<CustomerItemReferences> {
  const company = encodeURIComponent(companyId);
  async function readAll<T>(table: string, select: string, filter = ""): Promise<T[]> {
    const rows: T[] = [];
    // ponytail: bounded 10k reference set; switch to server-side lookup for larger tenants.
    for (let offset = 0; offset <= 10_000; offset += 1000) {
      const page = await supabaseRequest<T[]>(`${table}?company_id=eq.${company}&select=${select}${filter}&order=id&limit=1000&offset=${offset}`);
      rows.push(...page);
      if (rows.length > 10_000) throw new CustomerItemImportError("거래처 또는 상품이 10,000개를 넘습니다. 대량 자료 연결 준비 후 이용해 주세요.");
      if (page.length < 1000) return rows;
    }
    throw new CustomerItemImportError("거래처·상품 자료의 범위를 확인해 주세요.");
  }
  const [customers, products] = await Promise.all([
    readAll<{ id: string; customer_name: string }>("normalized_customers", "id,customer_name"),
    readAll<{ id: string; product_code: string | null }>("product_catalog", "id,product_code", "&is_active=eq.true"),
  ]);
  return { customers: customers.map(row => ({ id: row.id, name: row.customer_name })),
    products: products.filter(row => row.product_code).map(row => ({ id: row.id, code: row.product_code! })) };
}

export async function writeCustomerItemFile(companyId: string, fileName: unknown, input: unknown, actor: string) {
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255) throw new CustomerItemImportError("파일명을 확인해 주세요.");
  const { rows, auditRows } = prepareCustomerItemFile(input, await customerItemReferences(companyId));
  const idempotencyKey = "customer-items:" + createHash("sha256").update(JSON.stringify({ fileName, rows, auditRows })).digest("hex");
  return supabaseRequest<{ applied: number; skipped: number; replayed: boolean }>("rpc/import_customer_items_audited", {
    method: "POST", body: JSON.stringify({ p_company: companyId, p_file_name: fileName.trim(), p_actor: actor,
      p_key: idempotencyKey,
      p_rows: rows.map(row => ({ customer_id: row.customerId, product_id: row.productId, sales_unit: row.salesUnit,
        last_price: row.lastPrice, last_date: row.lastDate, tax_type: row.taxType, price_includes_tax: row.priceIncludesTax })),
      p_audit: auditRows.map(row => ({ source_row_number: row.sourceRowNumber, raw_values: row.originalValues, normalized_values: row.values })),
    }),
  });
}

export const writeCustomerItems: CustomerItemsWriter = (companyId, rows) =>
  supabaseRequest("rpc/import_customer_items", {
    method: "POST",
    body: JSON.stringify({
      p_company: companyId,
      p_rows: rows.map(row => ({
        customer_id: row.customerId, product_id: row.productId, sales_unit: row.salesUnit,
        last_price: row.lastPrice, last_date: row.lastDate,
        tax_type: row.taxType, price_includes_tax: row.priceIncludesTax,
      })),
    }),
  });
