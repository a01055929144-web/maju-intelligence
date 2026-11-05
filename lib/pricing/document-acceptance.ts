import { createHash } from "crypto";
import type { StaffDocumentAcceptance } from "../../application/pricing/accept-document";
import { supabaseRequest } from "../store";

export type DocumentAcceptanceResult = { customerId: string | null; leadId: string | null;
  documentVersionId: string; kind: "sheet" | "quote"; needsReview: boolean;
  pricingDocumentLinkId?: string; storefrontLinkId?: string | null; orderEnabled?: boolean };

export async function staffAcceptanceChoices(companyId: string, documentId?: string) {
  if (documentId) {
    const rows = await supabaseRequest<{ id: string; version: number; published_at: string; content: { title: string } }[]>(
      `pricing_document_versions?company_id=eq.${companyId}&document_id=eq.${documentId}&published_at=not.is.null&select=id,version,published_at,content&order=version.desc&limit=50`);
    return rows.map(row => ({ id: row.id, version: row.version, publishedAt: row.published_at, content: { title: row.content.title } }));
  }
  const rows = await supabaseRequest<{ id: string; revision: number; content: { title: string } }[]>(
    `pricing_documents?company_id=eq.${companyId}&select=id,revision,content&order=updated_at.desc,id.desc&limit=50`);
  return { items: rows.map(row => ({ id: row.id, revision: row.revision, content: { title: row.content.title } })) };
}

export async function acceptPricingDocumentForStaff(companyId: string, actorKey: string, input: StaffDocumentAcceptance) {
  const [version] = await supabaseRequest<{ id: string; document_id: string }[]>(
    `pricing_document_versions?company_id=eq.${companyId}&id=eq.${input.documentVersionId}&published_at=not.is.null&select=id,document_id&limit=1`);
  if (!version) throw new Error("수락할 게시 문서를 찾을 수 없습니다.");
  const [document] = await supabaseRequest<{ id: string; kind: string }[]>(
    `pricing_documents?company_id=eq.${companyId}&id=eq.${version.document_id}&select=id,kind&limit=1`);
  if (!document || !["sheet", "quote"].includes(document.kind))
    throw new Error("수락할 게시 문서를 찾을 수 없습니다.");
  const [customer] = input.customerId ? await supabaseRequest<{ id: string; customer_name: string; address: string | null; phone: string | null; business_registration_number: string | null }[]>(
    `normalized_customers?company_id=eq.${companyId}&id=eq.${input.customerId}&select=id,customer_name,address,phone,business_registration_number&limit=1`) : [];
  if (input.customerId && !customer) throw new Error("이 회사의 거래처를 찾을 수 없습니다.");
  const profile = customer ? { businessName: customer.customer_name, address: customer.address, phone: customer.phone,
    businessRegistrationNumber: customer.business_registration_number } : input.customerProfile;
  if (!profile) throw new Error("매장 기본 정보를 확인해 주세요.");
  if (input.leadId) {
    const leads = await supabaseRequest<{ id: string }[]>(`business_permit_leads?company_id=eq.${companyId}&id=eq.${input.leadId}&is_active=eq.true&merged_into_lead_id=is.null&select=id&limit=1`);
    if (!leads.length) throw new Error("이 회사의 리드를 찾을 수 없습니다.");
  } else if (!profile.businessName?.trim() || !profile.address?.trim() || !profile.phone?.replace(/\D/g, "")) {
    throw new Error("거래처 이름·주소·연락처를 먼저 보완해 주세요.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ companyId, actorKey, ...input })).digest("hex");
  const result = await supabaseRequest<DocumentAcceptanceResult>("rpc/record_pricing_document_acceptance", {
    method: "POST", body: JSON.stringify({ p_company_id: companyId, p_document_id: document.id,
      p_document_version_id: version.id, p_idempotency_key: input.idempotencyKey, p_request_fingerprint: fingerprint,
      p_accepted_via: "staff", p_customer_id: input.customerId, p_lead_id: input.leadId,
      p_customer_profile: profile }),
  });
  // A review result is never an instruction to issue or activate an ordering link.
  return { ...result, orderEnabled: false };
}
