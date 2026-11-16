import { calculateQuoteTaxLine, type QuoteTaxType } from "../../domains/quote/quote";

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type SignPhoto = (companyId: string, path: string) => Promise<string | undefined>;

export type PublicSalesQuote = {
  companyName: string;
  exemptSupplyAmount: number;
  items: Array<{ amount: number; photoUrl?: string; productName: string; quantity: number; salesUnitPrice: number; specification?: string; supplyAmount: number; taxAmount: number; taxType: QuoteTaxType; totalAmount: number; unit: string }>;
  quoteNumber: string;
  recipientName?: string;
  title: string;
  total: number;
  taxAmount: number;
  taxableSupplyAmount: number;
  validUntil: string;
};

export async function readPublicSalesQuote(
  request: Request,
  publicToken: string,
  signPhoto: SignPhoto,
  isMissingSchemaError: (error: unknown) => boolean
): Promise<PublicSalesQuote | null> {
  if (!/^[0-9a-f-]{36}$/i.test(publicToken)) return null;
  try {
    const quotes = await request<Array<{ company_id: string; id: string; quote_number: string; recipient_name: string | null; title: string; valid_until: string }>>(
      `sales_quotes?select=id,company_id,quote_number,recipient_name,title,valid_until&public_token=eq.${encodeURIComponent(publicToken)}&public_enabled=eq.true&valid_until=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`
    );
    const quote = quotes[0];
    if (!quote) return null;
    const [companies, items] = await Promise.all([
      request<Array<{ name: string }>>(`companies?select=name&id=eq.${encodeURIComponent(quote.company_id)}&limit=1`),
      request<Array<{ photo_url: string | null; product_name: string; quantity: number; sales_unit_price: number; specification: string | null; supply_amount: number | null; tax_amount: number | null; tax_type_snapshot: QuoteTaxType | null; total_amount: number | null; unit: string }>>(
        `sales_quote_items?select=product_name,specification,unit,quantity,sales_unit_price,photo_url,tax_type_snapshot,supply_amount,tax_amount,total_amount&company_id=eq.${encodeURIComponent(quote.company_id)}&quote_id=eq.${encodeURIComponent(quote.id)}&order=sort_order.asc`
      )
    ]);
    const publicItems = await Promise.all(items.map(async (item) => {
      const taxType: QuoteTaxType = item.tax_type_snapshot === "exempt" ? "exempt" : "taxable";
      const fallback = calculateQuoteTaxLine(Number(item.sales_unit_price), Number(item.quantity), taxType);
      return {
        amount: item.total_amount == null ? fallback.totalAmount : Number(item.total_amount),
        photoUrl: item.photo_url ? await signPhoto(quote.company_id, item.photo_url).catch(() => undefined) : undefined,
        productName: item.product_name,
        quantity: Number(item.quantity),
        salesUnitPrice: Number(item.sales_unit_price),
        specification: item.specification || undefined,
        supplyAmount: item.supply_amount == null ? fallback.supplyAmount : Number(item.supply_amount),
        taxAmount: item.tax_amount == null ? fallback.taxAmount : Number(item.tax_amount),
        taxType,
        totalAmount: item.total_amount == null ? fallback.totalAmount : Number(item.total_amount),
        unit: item.unit
      };
    }));
    const taxableSupplyAmount = publicItems.filter((item) => item.taxType === "taxable").reduce((sum, item) => sum + item.supplyAmount, 0);
    const exemptSupplyAmount = publicItems.filter((item) => item.taxType === "exempt").reduce((sum, item) => sum + item.supplyAmount, 0);
    const taxAmount = publicItems.reduce((sum, item) => sum + item.taxAmount, 0);
    return {
      companyName: companies[0]?.name || "MAJU 파트너",
      exemptSupplyAmount,
      items: publicItems,
      quoteNumber: quote.quote_number,
      recipientName: quote.recipient_name || undefined,
      title: quote.title,
      total: publicItems.reduce((sum, item) => sum + item.totalAmount, 0),
      taxAmount,
      taxableSupplyAmount,
      validUntil: quote.valid_until
    };
  } catch (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
}
