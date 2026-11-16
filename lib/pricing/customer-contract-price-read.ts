import type { QuoteTaxType } from "../../domains/quote/quote";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type CustomerContractPrice = {
  effectiveFrom: string;
  effectiveUntil?: string;
  id: string;
  productCatalogId: string;
  productCode?: string;
  productName: string;
  salesUnit: string;
  sourceQuoteId?: string;
  status: "active" | "cancelled" | "ended";
  taxType: QuoteTaxType;
  unitPrice: number;
};

export async function listCustomerContractPrices(
  request: Request,
  companyId: string,
  customerId: string
): Promise<CustomerContractPrice[]> {
  const rows = await request<Array<{
    effective_from: string; effective_until: string | null; id: string; product_catalog_id: string;
    product_catalog: { product_code: string | null; sales_product_name: string | null; purchase_product_name: string } | null;
    sales_unit: string; source_quote_id: string | null; status: CustomerContractPrice["status"]; tax_type: QuoteTaxType; unit_price: number;
  }>>(`customer_price_agreements?select=id,product_catalog_id,sales_unit,unit_price,tax_type,effective_from,effective_until,status,source_quote_id,product_catalog(product_code,sales_product_name,purchase_product_name)&company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(customerId)}&order=effective_from.desc`);
  return rows.map((row) => ({
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until || undefined,
    id: row.id,
    productCatalogId: row.product_catalog_id,
    productCode: row.product_catalog?.product_code || undefined,
    productName: row.product_catalog?.sales_product_name || row.product_catalog?.purchase_product_name || "표준 품목",
    salesUnit: row.sales_unit,
    sourceQuoteId: row.source_quote_id || undefined,
    status: row.status,
    taxType: row.tax_type,
    unitPrice: Number(row.unit_price)
  }));
}

export async function getCustomerContractPrice(
  request: Request,
  companyId: string,
  customerId: string,
  productCatalogId: string,
  date: string
) {
  const rows = await request<Array<{ id: string; sales_unit: string; tax_type: QuoteTaxType; unit_price: number }>>(
    `customer_price_agreements?select=id,sales_unit,unit_price,tax_type&company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(customerId)}&product_catalog_id=eq.${encodeURIComponent(productCatalogId)}&status=eq.active&effective_from=lte.${date}&or=(effective_until.is.null,effective_until.gte.${date})&order=effective_from.desc&limit=1`
  );
  const row = rows[0];
  return row ? { id: row.id, salesUnit: row.sales_unit, taxType: row.tax_type, unitPrice: Number(row.unit_price) } : null;
}
