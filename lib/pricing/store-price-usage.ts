import { supabaseRequest } from "../store";

/** 이 회사가 매장 개별 가격(견적 수락이 아닌 것)을 하나라도 쓰고 있나 — 가격 관리 탭에 "매장 가격"을 보일지 정한다. 조회 실패는 숨김으로 본다. */
export async function companyUsesStorePrices(companyId: string): Promise<boolean> {
  try {
    const rows = await supabaseRequest<Array<{ id: string }>>(`customer_price_agreements?select=id&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&source_quote_id=is.null&limit=1`);
    return rows.length > 0;
  } catch { return false; }
}
