import { field, isId, object } from "../../domains/pricing/document";

export function parseStaffDocumentAcceptance(input: unknown) {
  const body = object(input);
  if (!isId(body.documentVersionId) || (body.customerId != null && !isId(body.customerId)) || !isId(body.idempotencyKey) ||
    (body.leadId !== undefined && body.leadId !== null && !isId(body.leadId))) {
    throw new Error("수락할 문서·거래처·요청 번호를 확인해 주세요.");
  }
  const customerId = isId(body.customerId) ? body.customerId : null;
  const profile = customerId ? null : object(body.customerProfile);
  const customerProfile = profile ? { businessName: field(profile.businessName, 200, true),
    address: field(profile.address, 500, true), phone: field(profile.phone, 30, true),
    businessRegistrationNumber: field(profile.businessRegistrationNumber ?? "", 10) } : null;
  if (customerProfile && (!/^[+\d()\s-]{8,30}$/.test(customerProfile.phone) ||
    !/^\d{8,15}$/.test(customerProfile.phone.replace(/\D/g, "")) ||
    (customerProfile.businessRegistrationNumber && !/^\d{10}$/.test(customerProfile.businessRegistrationNumber))))
    throw new Error("매장 연락처·사업자번호를 확인해 주세요.");
  return { documentVersionId: body.documentVersionId, customerId, customerProfile,
    idempotencyKey: body.idempotencyKey, leadId: isId(body.leadId) ? body.leadId : null };
}
export type StaffDocumentAcceptance = ReturnType<typeof parseStaffDocumentAcceptance>;
