export type BusinessEntityType = "individual" | "corporation";

export type CustomerBusinessIdentityInput = {
  businessName?: string | null;
  subBusinessNumber?: string | null;
  businessEntityType?: string | null;
  corporateRegistrationNumber?: string | null;
};

export type CustomerBusinessIdentity = {
  businessName?: string;
  subBusinessNumber?: string;
  businessEntityType?: BusinessEntityType;
  corporateRegistrationNumber?: string;
};

export function parseCustomerBusinessIdentity(input: CustomerBusinessIdentityInput):
  | { ok: true; value: CustomerBusinessIdentity }
  | { ok: false; message: string } {
  const businessName = input.businessName?.trim() || undefined;
  const subBusinessNumber = input.subBusinessNumber?.trim() || undefined;
  const businessEntityType = input.businessEntityType?.trim() || undefined;
  const corporateRegistrationNumber = input.corporateRegistrationNumber?.replace(/[^0-9]/g, "") || undefined;

  if (subBusinessNumber && !/^[0-9]{4}$/.test(subBusinessNumber)) {
    return { ok: false, message: "종사업장번호는 숫자 4자리여야 합니다." };
  }
  if (businessEntityType && businessEntityType !== "individual" && businessEntityType !== "corporation") {
    return { ok: false, message: "사업자 유형은 개인 또는 법인이어야 합니다." };
  }
  if (corporateRegistrationNumber && !/^[0-9]{13}$/.test(corporateRegistrationNumber)) {
    return { ok: false, message: "법인등록번호는 숫자 13자리여야 합니다." };
  }

  return {
    ok: true,
    value: {
      businessName,
      subBusinessNumber,
      businessEntityType: businessEntityType as BusinessEntityType | undefined,
      corporateRegistrationNumber
    }
  };
}

export function buildCustomerBusinessKey(
  businessNumber: string,
  subBusinessNumber: string | undefined,
  exemptBusinessNumbers: ReadonlySet<string>,
  fallbackKey: string
) {
  if (!businessNumber || exemptBusinessNumbers.has(businessNumber)) return fallbackKey;
  return subBusinessNumber ? `${businessNumber}-${subBusinessNumber}` : businessNumber;
}

export function hasSubBusinessNumberConflict(
  subBusinessNumber: string | undefined,
  existingSubBusinessNumbers: Array<string | null | undefined>
) {
  return existingSubBusinessNumbers.some((existing) =>
    !subBusinessNumber || !existing || existing === subBusinessNumber
  );
}
