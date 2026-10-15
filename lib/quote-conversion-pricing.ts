type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

export type ConversionPricingResult = {
  pricingAppliedCount: number;
  pricingFailedCount: number;
};

export async function applyAcceptedQuotePricesAfterConversion({
  acceptQuote,
  companyId,
  customerId,
  leadId,
  request
}: {
  acceptQuote: (quoteId: string) => Promise<unknown>;
  companyId: string;
  customerId: string;
  leadId: string;
  request: Request;
}): Promise<ConversionPricingResult> {
  const quotes = await request<Array<{ customer_id: string | null; id: string }>>(
    "sales_quotes?select=id,customer_id"
      + `&company_id=eq.${encodeURIComponent(companyId)}`
      + `&lead_id=eq.${encodeURIComponent(leadId)}`
      + "&status=eq.accepted&pricing_applied_at=is.null"
      + `&or=(customer_id.is.null,customer_id.eq.${encodeURIComponent(customerId)})`
  );
  let pricingAppliedCount = 0;
  let pricingFailedCount = 0;

  for (const quote of quotes) {
    try {
      if (quote.customer_id !== customerId) {
        await request(
          `sales_quotes?company_id=eq.${encodeURIComponent(companyId)}`
            + `&id=eq.${encodeURIComponent(quote.id)}`,
          {
            body: JSON.stringify({ customer_id: customerId, updated_at: new Date().toISOString() }),
            headers: { Prefer: "return=minimal" },
            method: "PATCH"
          }
        );
      }
      await acceptQuote(quote.id);
      pricingAppliedCount += 1;
    } catch (error) {
      pricingFailedCount += 1;
      console.error("accepted quote price application failed after customer conversion", {
        error,
        quoteId: quote.id
      });
    }
  }

  return { pricingAppliedCount, pricingFailedCount };
}
