import type { CustomerItemsWriter } from "../application/customer/import-customer-items";
import { supabaseRequest } from "./store";

/** Enable only after approved schema application and readiness verification. */
export function customerItemsImportEnabled() {
  return process.env.CUSTOMER_ITEMS_IMPORT_ENABLED === "true";
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
