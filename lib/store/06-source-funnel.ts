import { joinSourceFunnel, summarizeSourceFunnel, type SourceFunnelInput } from "../../application/analytics/source-funnel";
import { supabaseRequest } from "../store";

export async function readSourceFunnelMetrics(companyId: string) {
  const company = encodeURIComponent(companyId);
  const [sends, acceptances, links, orders] = await Promise.all([
    supabaseRequest<Array<{ id: string; company_id: string; document_version_id: string; acceptance_status: string }>>(
      `pricing_document_sends?select=id,company_id,document_version_id,acceptance_status&company_id=eq.${company}&limit=5000`
    ),
    supabaseRequest<Array<{ id: string; company_id: string; send_id: string | null; customer_id: string | null; document_version_id: string }>>(
      `pricing_document_acceptance_requests?select=id,company_id,send_id,customer_id,document_version_id&company_id=eq.${company}&limit=5000`
    ),
    supabaseRequest<Array<{ id: string; company_id: string; acceptance_request_id: string | null; customer_id: string; document_version_id: string }>>(
      `storefront_links?select=id,company_id,acceptance_request_id,customer_id,document_version_id&company_id=eq.${company}&source=eq.document&limit=5000`
    ),
    supabaseRequest<Array<{ id: string; company_id: string; link_id: string; customer_id: string; document_version_id: string; status: string; submitted_at: string }>>(
      `store_orders?select=id,company_id,link_id,customer_id,document_version_id,status,submitted_at&company_id=eq.${company}&document_version_id=not.is.null&limit=5000`
    )
  ]);

  const input: SourceFunnelInput = {
    sends: sends.map((row) => ({ id: row.id, companyId: row.company_id, documentVersionId: row.document_version_id, acceptanceStatus: row.acceptance_status })),
    acceptances: acceptances.map((row) => ({ id: row.id, companyId: row.company_id, sendId: row.send_id, customerId: row.customer_id, documentVersionId: row.document_version_id })),
    links: links.map((row) => ({ id: row.id, companyId: row.company_id, acceptanceRequestId: row.acceptance_request_id, customerId: row.customer_id, documentVersionId: row.document_version_id })),
    orders: orders.map((row) => ({ id: row.id, companyId: row.company_id, linkId: row.link_id, customerId: row.customer_id, documentVersionId: row.document_version_id, status: row.status, submittedAt: row.submitted_at }))
  };
  return summarizeSourceFunnel(joinSourceFunnel(input));
}
