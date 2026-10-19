const PROVINCE_ALIASES: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "광주광역시",
  대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도",
  충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도"
};

export function extractLeadAdministrativeArea(address?: string | null) {
  const tokens = (address || "").replace(/[(),]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const first = PROVINCE_ALIASES[tokens[0]] || tokens[0];
  const localIndex = tokens.findIndex((token, index) => index > 0 && /(?:시|군|구)$/.test(token));
  return localIndex < 0 ? "" : `${first} ${tokens[localIndex]}`;
}

export function extractLeadAdministrativeSubarea(address?: string | null) {
  const tokens = (address || "").replace(/[(),]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const province = PROVINCE_ALIASES[tokens[0]] || tokens[0];
  const cityIndex = tokens.findIndex((token, index) => index > 0 && token.endsWith("시"));
  const district = cityIndex >= 0 ? tokens[cityIndex + 1] : undefined;
  return district?.endsWith("구") ? `${province} ${tokens[cityIndex]} ${district}` : "";
}

export function extractLeadAdministrativeAreas(address?: string | null) {
  return {
    administrativeArea: extractLeadAdministrativeArea(address),
    administrativeSubarea: extractLeadAdministrativeSubarea(address)
  };
}

export function isLeadAddressInSalesAreas(address: string | null | undefined, areas: readonly string[]) {
  const { administrativeArea, administrativeSubarea } = extractLeadAdministrativeAreas(address);
  return Boolean(
    (administrativeArea && areas.includes(administrativeArea)) ||
    (administrativeSubarea && areas.includes(administrativeSubarea))
  );
}

export function shouldApplySalesAreaFilter(areas: readonly string[], includeOutsideSalesArea: boolean) {
  return !includeOutsideSalesArea && areas.length > 0;
}

export function getAdministrativeAreaForEnrichedAddress(
  currentAddress?: string | null,
  enrichedAddress?: string | null
) {
  if (currentAddress || !enrichedAddress) return undefined;
  return extractLeadAdministrativeArea(enrichedAddress) || null;
}

export function getAdministrativeSubareaForEnrichedAddress(
  currentAddress?: string | null,
  enrichedAddress?: string | null
) {
  if (currentAddress || !enrichedAddress) return undefined;
  return extractLeadAdministrativeSubarea(enrichedAddress) || null;
}

export function resolveVisitResultStatus(actionType: string, result?: string) {
  if (result === "거래 시작") return "전환 진행";
  if (result === "거절" || result === "제외" || actionType === "exclude") return "제외";
  return undefined;
}

const TECHNICAL_LEAD_ACTION_RESULTS = new Set(["외부 정보 보강", "인스타 정보 수정"]);

export function isUserSalesLeadAction(actionType?: string | null, result?: string | null) {
  return !(actionType === "hold" && TECHNICAL_LEAD_ACTION_RESULTS.has(result || ""));
}

export function resolveMatchedCustomerLeadStatus(hasUserSalesAction: boolean) {
  return hasUserSalesAction ? "거래처 전환" : "기존 거래처";
}
