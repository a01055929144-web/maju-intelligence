const DIRECT_TEMPORARY_TERMS = ["한시적", "행사장", "팝업"] as const;
const TEMPORARY_AREA_WORD_PATTERN = /(?:^|[\s,(])(?:일원|일대)(?=$|[\s,.)])/;
const CONFIRMED_PLAZA_PATTERN = /(?:공원|시민|역)\s*광장(?=$|[\s,.)])/;
const AMBIGUOUS_PLAZA_PATTERN = /(?:^|[\s,(])광장(?=$|[\s,.)])/;
export const TEMPORARY_OPERATION_MAX_DAYS = 90;

export type TemporaryOperationClassification = {
  isSuspected: boolean;
  isTemporary: boolean;
  reason?: string;
};

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyTemporaryPermitLead(input: {
  address?: string;
  businessName?: string;
  closeDate?: string;
  openDate?: string;
  permitDate?: string;
}): TemporaryOperationClassification {
  const businessName = (input.businessName || "").replace(/\s+/g, " ").trim();
  const address = (input.address || "").replace(/\s+/g, " ").trim();
  const directTerm = DIRECT_TEMPORARY_TERMS.find((term) => businessName.includes(term) || address.includes(term));
  if (directTerm) return { isSuspected: false, isTemporary: true, reason: `단기 영업 표지: ${directTerm}` };

  const areaWord = address.match(TEMPORARY_AREA_WORD_PATTERN)?.[0]?.trim();
  if (areaWord) return { isSuspected: false, isTemporary: true, reason: `단기 영업 표지: ${areaWord}` };

  if (CONFIRMED_PLAZA_PATTERN.test(address)) {
    return { isSuspected: false, isTemporary: true, reason: "단기 영업 표지: 광장" };
  }
  if (AMBIGUOUS_PLAZA_PATTERN.test(address)) {
    return { isSuspected: true, isTemporary: false, reason: "임시 영업 의심: 광장" };
  }

  const start = parseDate(input.openDate) || parseDate(input.permitDate);
  const end = parseDate(input.closeDate);
  if (start && end) {
    const durationDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    if (durationDays >= 0 && durationDays <= TEMPORARY_OPERATION_MAX_DAYS) {
      return { isSuspected: false, isTemporary: true, reason: `인허가 기간 ${durationDays}일` };
    }
  }
  return { isSuspected: false, isTemporary: false };
}
