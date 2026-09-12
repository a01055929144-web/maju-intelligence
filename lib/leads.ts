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

export type LeadDuplicateCandidate = {
  id: string;
  customerName: string;
  businessNumber?: string | null;
  address?: string | null;
  phone?: string | null;
};

export type LeadDuplicateMatch = {
  customerId: string;
  customerName: string;
  reason: "사업자번호 일치" | "상호명·전화번호 일치" | "상호명·주소 일치";
};

/** Converts Kakao's detailed place category into the smaller industry buckets used by MAJU. */
export function normalizeKakaoCategoryIndustry(category: string) {
  const value = category.trim();
  if (!value) return "미분류";
  const rules: ReadonlyArray<[string, RegExp]> = [
    ["한식", /한식|국밥|해장국|백반|찌개|탕|곰탕|설렁탕|분식|족발|보쌈|삼겹살|갈비|곱창/],
    ["카페/디저트", /카페|커피|디저트|베이커리|제과|빵/],
    ["일식", /일식|이자카야|스시|초밥|라멘|돈카츠|우동|회/],
    ["중식", /중식|중국요리|마라|양꼬치|짬뽕|짜장/],
    ["프랜차이즈/배달", /치킨|피자|버거|패스트푸드/],
    ["주점", /주점|포차|호프|술집|바$/],
    ["양식", /양식|파스타|스테이크|브런치/],
    ["뷔페/단체급식", /뷔페|단체급식|구내식당|케이터링/]
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || value;
}

function normalizeDuplicateText(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/\s/g, "").replace(/[^0-9a-z가-힣]/g, "");
}

function normalizeDuplicatePhone(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function normalizeDuplicateBusinessNumber(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

/**
 * 리드와 기존 거래처의 확정 중복만 판정합니다. 전화번호나 주소만 같은 경우(대표번호·공용 주소)는
 * 다른 지점일 수 있으므로 반드시 정규화된 상호명까지 같을 때만 중복으로 봅니다.
 */
export function findLeadCustomerDuplicate(
  lead: { businessName: string; businessNumber?: string | null; address?: string | null; phone?: string | null },
  customers: readonly LeadDuplicateCandidate[]
): LeadDuplicateMatch | null {
  const businessNumber = normalizeDuplicateBusinessNumber(lead.businessNumber);
  const name = normalizeDuplicateText(lead.businessName);
  const phone = normalizeDuplicatePhone(lead.phone);
  const address = normalizeDuplicateText(lead.address);

  for (const customer of customers) {
    const customerBusinessNumber = normalizeDuplicateBusinessNumber(customer.businessNumber);
    const isPlaceholderBusinessNumber = /^(\d)\1{9}$/.test(businessNumber);
    if (businessNumber.length === 10 && !isPlaceholderBusinessNumber && businessNumber === customerBusinessNumber) {
      return { customerId: customer.id, customerName: customer.customerName, reason: "사업자번호 일치" };
    }
  }

  if (!name) return null;
  for (const customer of customers) {
    if (name !== normalizeDuplicateText(customer.customerName)) continue;
    const customerPhone = normalizeDuplicatePhone(customer.phone);
    if (phone.length >= 8 && phone === customerPhone) {
      return { customerId: customer.id, customerName: customer.customerName, reason: "상호명·전화번호 일치" };
    }
    const customerAddress = normalizeDuplicateText(customer.address);
    if (address.length >= 5 && address === customerAddress) {
      return { customerId: customer.id, customerName: customer.customerName, reason: "상호명·주소 일치" };
    }
  }

  return null;
}

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
