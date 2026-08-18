import type { LeadRecommendation } from "./analysis";

type KakaoPlaceDocument = {
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  phone?: string;
  place_url?: string;
  id?: string;
};

type RealBusinessCandidate = {
  name: string;
  address: string;
  phone: string;
  placeUrl: string;
};

function normalizeNameForCompare(value: string) {
  return value.toLowerCase().replace(/\s/g, "").replace(/[^0-9a-z가-힣]/g, "");
}

function isKakaoRestKeyConfigured() {
  const key = process.env.KAKAO_REST_KEY;
  return Boolean(key && key !== "replace-with-kakao-rest-api-key");
}

/**
 * Searches real businesses via Kakao's Local keyword search API. Returns an empty array
 * (never throws) when the API key is missing, the query is empty, or the request fails —
 * callers should treat this as "no real data available" and fall back gracefully.
 */
async function searchRealBusinesses(query: string, excludeNames: Set<string>): Promise<RealBusinessCandidate[]> {
  const restKey = process.env.KAKAO_REST_KEY;
  if (!isKakaoRestKeyConfigured() || !query.trim()) return [];

  try {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=15`, {
      headers: { Authorization: `KakaoAK ${restKey}` },
      cache: "no-store"
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { documents?: KakaoPlaceDocument[] };
    const documents = payload.documents || [];

    return documents
      .filter((doc) => doc.place_name && !excludeNames.has(normalizeNameForCompare(doc.place_name)))
      .map((doc) => ({
        name: doc.place_name || "",
        address: doc.road_address_name || doc.address_name || "",
        phone: doc.phone || "",
        placeUrl: doc.place_url || (doc.id ? `https://place.map.kakao.com/${doc.id}` : "")
      }));
  } catch {
    return [];
  }
}

/**
 * Replaces synthetic "지역 업종 A/B" lead names with real businesses found via Kakao Local
 * search, when a KAKAO_REST_KEY is configured. Leads whose region+industry query returns no
 * real (and not-already-a-customer) result keep their original synthetic placeholder — this
 * never fabricates fake-looking data, it only upgrades entries when real data is available.
 */
export async function enrichLeadRecommendations(
  leads: LeadRecommendation[],
  existingCustomerNames: Iterable<string>
): Promise<LeadRecommendation[]> {
  if (!leads.length || !isKakaoRestKeyConfigured()) return leads;

  const excludeNames = new Set(Array.from(existingCustomerNames, normalizeNameForCompare));
  const usedNames = new Set<string>();
  const candidatesByGroup = new Map<string, RealBusinessCandidate[]>();

  const groups = Array.from(new Set(leads.map((lead) => `${lead.region}|${lead.industry || ""}`)));
  await Promise.all(
    groups.map(async (group) => {
      const [region, industry] = group.split("|");
      const query = industry ? `${region} ${industry}` : region;
      const results = await searchRealBusinesses(query, excludeNames);
      candidatesByGroup.set(group, results);
    })
  );

  return leads.map((lead) => {
    const group = `${lead.region}|${lead.industry || ""}`;
    const candidates = candidatesByGroup.get(group) || [];
    const candidate = candidates.find((item) => !usedNames.has(normalizeNameForCompare(item.name)));
    if (!candidate) return lead;

    usedNames.add(normalizeNameForCompare(candidate.name));
    const addressReason = candidate.address ? `실주소: ${candidate.address}` : null;
    const reasons = [...lead.reasons.slice(0, 2), addressReason || lead.reasons[2] || "실거래처 후보"].filter((value): value is string => Boolean(value));

    return {
      ...lead,
      name: candidate.name,
      reasons
    };
  });
}
