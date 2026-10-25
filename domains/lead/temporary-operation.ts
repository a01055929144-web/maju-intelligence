const TEMPORARY_OPERATION_TERMS = ["한시적", "행사장", "팝업", "일원", "일대", "광장"] as const;
export const TEMPORARY_OPERATION_MAX_DAYS = 90;

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
}) {
  const text = `${input.businessName || ""} ${input.address || ""}`.replace(/\s+/g, " ");
  const matchedTerm = TEMPORARY_OPERATION_TERMS.find((term) => text.includes(term));
  if (matchedTerm) return { isTemporary: true, reason: `단기 영업 표지: ${matchedTerm}` } as const;

  const start = parseDate(input.openDate) || parseDate(input.permitDate);
  const end = parseDate(input.closeDate);
  if (start && end) {
    const durationDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    if (durationDays >= 0 && durationDays <= TEMPORARY_OPERATION_MAX_DAYS) {
      return { isTemporary: true, reason: `인허가 기간 ${durationDays}일` } as const;
    }
  }
  return { isTemporary: false, reason: undefined } as const;
}
