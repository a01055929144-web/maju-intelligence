export type CanonicalLeadIdentityInput = {
  businessName: string;
  address?: string;
  businessNumber?: string;
  sourceRecordKey?: string;
};

export function normalizeLeadIdentityText(value: string | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export function normalizeLeadIdentityAddress(value: string | undefined) {
  return normalizeLeadIdentityText(
    String(value || "")
      .replace(/\s+(지하|제?\d+층|\d+호).*$/, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function normalizeLeadBusinessNumber(value: string | undefined) {
  return String(value || "").replace(/\D/g, "");
}

export function buildLeadCanonicalFingerprint(input: CanonicalLeadIdentityInput) {
  const businessNumber = normalizeLeadBusinessNumber(input.businessNumber);
  if (businessNumber) return `business:${businessNumber}`;
  const name = normalizeLeadIdentityText(input.businessName);
  const address = normalizeLeadIdentityAddress(input.address);
  return name && address ? `place:${name}:${address}` : name ? `name:${name}` : "";
}

export function buildLeadSourceRecordKey(input: CanonicalLeadIdentityInput) {
  const sourceRecordKey = normalizeLeadIdentityText(input.sourceRecordKey);
  if (sourceRecordKey) return `source:${sourceRecordKey}`;
  return buildLeadCanonicalFingerprint(input);
}

export function isClosedPermitRecord(status?: string, closeDate?: string) {
  return Boolean(closeDate?.trim()) || /폐업|취소|말소|직권폐업|영업정지/.test(status || "");
}
