const PERMIT_EXCLUDED_INDUSTRY_KEYWORDS = [
  "미용실", "이용원", "네일", "피부관리", "학원", "교습소", "공인중개사", "부동산중개",
  "병원", "의원", "약국", "한의원", "동물병원", "세탁", "정비", "카센터", "숙박업", "모텔",
  "여관", "고시원", "PC방", "노래연습장", "당구장", "골프연습장", "체육시설", "독서실", "안경"
];

export const PERMIT_INDUSTRY_RULES: ReadonlyArray<{ primary: string; keywords: string[] }> = [
  { primary: "한식", keywords: ["한식", "국밥", "해장국", "백반", "찌개", "곰탕", "설렁탕", "분식", "식당", "닭갈비", "갈비", "칼국수", "전집", "막창", "김밥", "튀김", "반찬", "혼밥", "도시락", "횟집", "회집", "생선회"] },
  { primary: "카페/디저트", keywords: ["카페", "커피", "coffee", "디저트", "도넛", "베이커리", "제과", "빵집", "빠띠시에", "떡집"] },
  { primary: "일식", keywords: ["일식", "이자카야", "스시", "라멘", "돈카츠", "우동"] },
  { primary: "중식", keywords: ["중식", "중국식", "마라탕", "양꼬치", "짬뽕", "짜장"] },
  { primary: "프랜차이즈/배달", keywords: ["치킨", "피자", "버거", "패스트푸드"] },
  { primary: "주점", keywords: ["주점", "포차", "호프", "술집"] },
  { primary: "양식", keywords: ["양식", "경양식", "외국음식전문점", "패밀리레스토랑", "파스타", "스테이크", "브런치", "타코"] },
  { primary: "뷔페/단체급식", keywords: ["뷔페", "부페", "단체급식", "구내식당", "케이터링"] }
];

export function classifyPermitLeadIndustry(rawIndustryText: string, businessName: string) {
  const haystack = `${rawIndustryText || ""} ${businessName || ""}`;
  for (const excluded of PERMIT_EXCLUDED_INDUSTRY_KEYWORDS) {
    if (haystack.includes(excluded)) {
      return { primary: rawIndustryText?.trim() || "비대상 업종", tags: [] as string[], isTarget: false };
    }
  }
  for (const rule of PERMIT_INDUSTRY_RULES) {
    const matchedTags = rule.keywords.filter((keyword) => haystack.includes(keyword));
    if (matchedTags.length) return { primary: rule.primary, tags: matchedTags, isTarget: true };
  }
  const looksLikeFoodService = /음식점|식당|분식|급식|주점|카페|제과|호프|포차|기타/.test(rawIndustryText || "");
  return {
    primary: rawIndustryText?.trim() || "미분류",
    tags: [] as string[],
    isTarget: looksLikeFoodService || !rawIndustryText?.trim()
  };
}
