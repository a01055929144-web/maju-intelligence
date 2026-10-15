export type ProductSupplierProfileInput = {
  businessNumber?: string;
  contactEmail?: string;
  contactName?: string;
  contactPhone?: string;
  memo?: string;
  paymentTerms?: string;
  representativeName?: string;
};

export type NormalizedProductSupplierProfile = {
  business_number: string | null;
  contact_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  memo: string | null;
  payment_terms: string | null;
  representative_name: string | null;
};

const text = (value: unknown, maxLength: number, label: string) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) {
    throw new Error(`${label}은 ${maxLength}자 이하로 입력해 주세요.`);
  }
  return normalized || null;
};

export function normalizeProductSupplierProfile(
  input: ProductSupplierProfileInput
): NormalizedProductSupplierProfile {
  const businessNumber = (input.businessNumber || "").replace(/[^0-9]/g, "");
  if (businessNumber && businessNumber.length !== 10) {
    throw new Error("사업자등록번호는 숫자 10자리로 입력해 주세요.");
  }

  return {
    business_number: businessNumber || null,
    contact_email: text(input.contactEmail, 254, "담당자 이메일"),
    contact_name: text(input.contactName, 100, "담당자명"),
    contact_phone: text(input.contactPhone, 30, "담당자 연락처"),
    memo: text(input.memo, 4000, "메모"),
    payment_terms: text(input.paymentTerms, 500, "결제 조건"),
    representative_name: text(input.representativeName, 100, "대표자명")
  };
}
