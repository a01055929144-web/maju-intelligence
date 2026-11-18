import { normalizePartnerRegistration, type PartnerRegistrationInput } from "@/domains/partner/registration";
import { supabaseRequest, upsertCustomerMaster } from "@/lib/store";

const enc = encodeURIComponent;
export type PartnerDuplicateCandidate = { id: string; partnerType: "customer" | "supplier" | "lead"; name: string; reason: string };

export async function findPartnerDuplicateCandidates(companyId: string, raw: PartnerRegistrationInput) {
  const input = normalizePartnerRegistration(raw);
  const phone = input.phone.replace(/\D/g, "");
  const number = input.businessNumber || "";
  const [customers, suppliers, leads] = await Promise.all([
    supabaseRequest<Array<{ id: string; customer_name: string; business_registration_number: string | null; phone: string | null; address: string | null }>>(`normalized_customers?select=id,customer_name,business_registration_number,phone,address&company_id=eq.${enc(companyId)}&duplicate_of=is.null&limit=5000`),
    supabaseRequest<Array<{ id: string; name: string; business_number: string | null; contact_phone: string | null; address: string | null }>>(`product_suppliers?select=id,name,business_number,contact_phone,address&company_id=eq.${enc(companyId)}&limit=5000`),
    supabaseRequest<Array<{ id: string; business_name: string | null; phone: string | null; address: string | null }>>(`business_permit_leads?select=id,business_name,phone,address&company_id=eq.${enc(companyId)}&status=neq.converted&limit=5000`).catch(() => [])
  ]);
  const match = (name: string, candidatePhone: string | null, candidateNumber: string | null, address: string | null) =>
    (number && candidateNumber?.replace(/\D/g, "") === number) ? "사업자번호 일치" :
    (phone && candidatePhone?.replace(/\D/g, "") === phone) ? "연락처 일치" :
    (name.trim() === input.displayName && address?.trim() === input.address) ? "상호·주소 일치" : "";
  return [
    ...customers.flatMap((row) => { const reason = match(row.customer_name, row.phone, row.business_registration_number, row.address); return reason ? [{ id: row.id, partnerType: "customer" as const, name: row.customer_name, reason }] : []; }),
    ...suppliers.flatMap((row) => { const reason = match(row.name, row.contact_phone, row.business_number, row.address); return reason ? [{ id: row.id, partnerType: "supplier" as const, name: row.name, reason }] : []; }),
    ...leads.flatMap((row) => { const reason = match(row.business_name || "", row.phone, null, row.address); return reason ? [{ id: row.id, partnerType: "lead" as const, name: row.business_name || "이름 없는 리드", reason }] : []; })
  ] satisfies PartnerDuplicateCandidate[];
}

export async function createBusinessPartner(companyId: string, raw: PartnerRegistrationInput) {
  const input = normalizePartnerRegistration(raw);
  let id: string;
  if (input.partnerType === "customer") {
    const result = await upsertCustomerMaster({ customerName: input.displayName, representativeName: input.representativeName, phone: input.phone, address: input.address, businessNumber: input.businessNumber, businessEntityType: input.businessEntityType, businessStatus: input.businessStatus, expectedOpeningDate: input.expectedOpeningDate, taxInvoiceEmail: input.taxInvoiceEmail }, companyId, {}, { confirmDuplicate: true });
    id = result.customer.id;
  } else {
    const [created] = await supabaseRequest<Array<{ id: string }>>("product_suppliers?select=id", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: companyId, name: input.displayName, representative_name: input.representativeName, contact_phone: input.phone, address: input.address, address_detail: input.addressDetail || null, business_number: input.businessNumber || null, business_status: input.businessStatus, expected_opening_date: input.expectedOpeningDate || null, business_entity_type: input.businessEntityType || null, tax_invoice_email: input.taxInvoiceEmail || null, memo: input.memo || null, is_active: input.businessStatus !== "closed" }) });
    if (!created) throw new Error("매입처를 저장하지 못했습니다.");
    id = created.id;
  }
  await supabaseRequest("business_partner_registration_events", { method: "POST", body: JSON.stringify({ company_id: companyId, partner_type: input.partnerType, partner_id: id, action: "created", after_values: { businessStatus: input.businessStatus, hasBusinessNumber: Boolean(input.businessNumber), expectedOpeningDate: input.expectedOpeningDate || null } }) });
  return { id, partnerType: input.partnerType };
}
