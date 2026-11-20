import type { PartnerType } from "./directory";

export type PartnerBusinessStatus = "active" | "registration_pending" | "suspended" | "closed";
export type PartnerRegistrationInput = {
  partnerType: PartnerType;
  displayName: string;
  representativeName: string;
  phone: string;
  address: string;
  addressDetail?: string;
  businessStatus: PartnerBusinessStatus;
  expectedOpeningDate?: string;
  businessNumber?: string;
  businessEntityType?: "individual" | "corporation";
  taxInvoiceEmail?: string;
  memo?: string;
};

export const PARTNER_STATUS_LABELS: Record<PartnerBusinessStatus, string> = {
  active: "사업자 확인됨",
  registration_pending: "개업 준비",
  suspended: "휴업",
  closed: "폐업"
};

const clean = (value?: string) => value?.trim() || "";
export function normalizePartnerRegistration(input: PartnerRegistrationInput): PartnerRegistrationInput {
  const normalized = { ...input, displayName: clean(input.displayName), representativeName: clean(input.representativeName), phone: clean(input.phone), address: clean(input.address), addressDetail: clean(input.addressDetail), businessNumber: clean(input.businessNumber).replace(/\D/g, ""), taxInvoiceEmail: clean(input.taxInvoiceEmail), memo: clean(input.memo) };
  if (!normalized.displayName || !normalized.representativeName || !normalized.phone || !normalized.address) throw new Error("상호·대표자·연락처·주소를 모두 입력해 주세요.");
  if (normalized.businessStatus !== "registration_pending") {
    if (!/^\d{10}$/.test(normalized.businessNumber || "")) throw new Error("사업자번호는 숫자 10자리로 입력해 주세요.");
    if (!normalized.businessEntityType || !normalized.taxInvoiceEmail) throw new Error("사업자 형태와 계산서 이메일을 입력해 주세요.");
  }
  return normalized;
}

export const canIssuePartnerTaxInvoice = (status: PartnerBusinessStatus) => status === "active";
