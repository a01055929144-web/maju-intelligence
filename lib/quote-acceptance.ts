export type AcceptSalesQuoteResult = {
  alreadyApplied: boolean;
  appliedCount: number;
  pendingCustomerConversion: boolean;
  taxUnconfirmedCount: number;
  unlinkedCount: number;
};

type AcceptSalesQuoteRpcResult = {
  already_applied?: boolean;
  applied_count?: number;
  pending_customer_conversion?: boolean;
  tax_unconfirmed_count?: number;
  unlinked_count?: number;
};

type RpcRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export async function invokeQuoteAcceptanceRpc(
  request: RpcRequest,
  input: { actorName?: string; companyId: string; effectiveDate: string; quoteId: string }
): Promise<AcceptSalesQuoteResult> {
  try {
    const result = await request<AcceptSalesQuoteRpcResult>("rpc/accept_sales_quote_and_apply_prices", {
      method: "POST",
      body: JSON.stringify({
        p_actor_name: input.actorName || null,
        p_company_id: input.companyId,
        p_effective_date: input.effectiveDate,
        p_quote_id: input.quoteId
      })
    });
    return {
      alreadyApplied: Boolean(result?.already_applied),
      appliedCount: Number(result?.applied_count) || 0,
      pendingCustomerConversion: Boolean(result?.pending_customer_conversion),
      taxUnconfirmedCount: Number(result?.tax_unconfirmed_count) || 0,
      unlinkedCount: Number(result?.unlinked_count) || 0
    };
  } catch (error) {
    const message = error instanceof Error && /no_overlap|exclusion|23P01/i.test(error.message)
      ? "이미 적용 중인 계약 단가 기간과 겹칩니다. 기존 계약 기간을 확인해 주세요."
      : error instanceof Error ? error.message : "계약 단가를 반영하지 못했습니다.";
    throw new Error(message);
  }
}
