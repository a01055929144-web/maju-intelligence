import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getSalesAssistantDrafts } from "@/lib/store";

const recommendationCounts = [10, 20, 30] as const;
type RecommendationCount = (typeof recommendationCounts)[number];

type ProductCandidate = {
  item: string;
  keywords: string[];
  industries: string[];
};

const productCandidates: ProductCandidate[] = [
  { item: "쌀 20kg", industries: ["한식", "분식", "일식", "뷔페/단체급식"], keywords: ["밥", "덮밥", "국밥", "백반", "초밥", "김밥"] },
  { item: "돼지고기 앞다리살", industries: ["한식", "고기/구이", "뷔페/단체급식"], keywords: ["제육", "찌개", "불고기", "수육"] },
  { item: "삼겹살", industries: ["고기/구이", "한식"], keywords: ["삼겹살", "구이", "김치찌개"] },
  { item: "소고기(구이·국거리)", industries: ["고기/구이", "한식", "뷔페/단체급식"], keywords: ["소고기", "불고기", "갈비", "국거리"] },
  { item: "닭정육", industries: ["한식", "프랜차이즈/배달", "주점"], keywords: ["닭", "치킨", "닭갈비", "닭볶음탕"] },
  { item: "대파", industries: ["한식", "중식", "일식", "분식"], keywords: ["국", "찌개", "탕", "면"] },
  { item: "양파", industries: ["한식", "중식", "양식", "분식"], keywords: ["볶음", "카레", "소스", "덮밥"] },
  { item: "마늘", industries: ["한식", "고기/구이", "중식", "양식"], keywords: ["마늘", "구이", "볶음", "알리오"] },
  { item: "감자", industries: ["한식", "양식", "분식"], keywords: ["감자", "탕", "튀김", "카레"] },
  { item: "무", industries: ["한식", "일식", "뷔페/단체급식"], keywords: ["국", "탕", "조림", "깍두기"] },
  { item: "배추", industries: ["한식", "뷔페/단체급식"], keywords: ["김치", "겉절이", "쌈"] },
  { item: "쌈채소 세트", industries: ["고기/구이", "한식"], keywords: ["쌈", "구이", "보쌈", "족발"] },
  { item: "깻잎", industries: ["고기/구이", "곱창/막창", "분식"], keywords: ["깻잎", "쌈", "순대", "곱창"] },
  { item: "부추", industries: ["곱창/막창", "한식"], keywords: ["곱창", "국밥", "부추", "전"] },
  { item: "청경채", industries: ["중식", "뷔페/단체급식"], keywords: ["청경채", "볶음", "마라", "짬뽕"] },
  { item: "떡볶이떡", industries: ["분식"], keywords: ["떡볶이", "떡", "분식"] },
  { item: "어묵", industries: ["분식", "한식"], keywords: ["어묵", "오뎅", "떡볶이", "탕"] },
  { item: "순대", industries: ["분식", "한식"], keywords: ["순대", "국밥", "분식"] },
  { item: "라면·우동 사리", industries: ["분식", "주점", "한식"], keywords: ["라면", "우동", "사리", "전골"] },
  { item: "파스타면", industries: ["양식"], keywords: ["파스타", "스파게티", "알리오", "크림"] },
  { item: "토마토소스", industries: ["양식", "프랜차이즈/배달"], keywords: ["토마토", "파스타", "피자"] },
  { item: "올리브유", industries: ["양식", "카페/디저트"], keywords: ["샐러드", "파스타", "브런치"] },
  { item: "모차렐라 치즈", industries: ["양식", "프랜차이즈/배달", "카페/디저트"], keywords: ["피자", "치즈", "파스타", "브런치"] },
  { item: "초밥용 김", industries: ["일식", "분식"], keywords: ["초밥", "김밥", "롤", "마끼"] },
  { item: "냉동 생선류", industries: ["일식", "한식", "뷔페/단체급식"], keywords: ["회", "초밥", "생선", "구이"] },
  { item: "와사비", industries: ["일식"], keywords: ["초밥", "회", "사시미"] },
  { item: "면류(생면)", industries: ["중식", "일식"], keywords: ["짜장", "짬뽕", "우동", "라멘", "면"] },
  { item: "굴소스", industries: ["중식"], keywords: ["중식", "볶음", "짜장", "덮밥"] },
  { item: "두반장", industries: ["중식"], keywords: ["마라", "마파", "두반장", "중식"] },
  { item: "튀김가루", industries: ["분식", "프랜차이즈/배달", "주점"], keywords: ["튀김", "치킨", "돈가스"] },
  { item: "식용유 18L", industries: ["한식", "중식", "분식", "프랜차이즈/배달", "뷔페/단체급식"], keywords: ["튀김", "볶음", "전"] },
  { item: "간장 18L", industries: ["한식", "일식", "중식"], keywords: ["간장", "조림", "불고기", "덮밥"] },
  { item: "고춧가루", industries: ["한식", "분식"], keywords: ["김치", "찌개", "매운", "떡볶이"] },
  { item: "된장", industries: ["한식", "고기/구이"], keywords: ["된장", "찌개", "쌈장"] },
  { item: "육수 베이스", industries: ["한식", "일식", "분식", "뷔페/단체급식"], keywords: ["국", "탕", "찌개", "전골", "우동"] },
  { item: "원두 1kg", industries: ["카페/디저트"], keywords: ["커피", "아메리카노", "라떼", "카페"] },
  { item: "우유 1L", industries: ["카페/디저트", "양식"], keywords: ["라떼", "우유", "크림", "브런치"] },
  { item: "생크림", industries: ["카페/디저트", "양식"], keywords: ["케이크", "크림", "디저트", "파스타"] },
  { item: "박력분 20kg", industries: ["카페/디저트", "뷔페/단체급식"], keywords: ["빵", "케이크", "쿠키", "베이커리"] },
  { item: "냉동 감자튀김", industries: ["프랜차이즈/배달", "주점", "양식"], keywords: ["감자튀김", "버거", "치킨", "안주"] },
  { item: "포장 용기", industries: ["프랜차이즈/배달", "분식", "카페/디저트"], keywords: ["배달", "포장", "테이크아웃"] },
  { item: "일회용 컵·뚜껑", industries: ["카페/디저트", "프랜차이즈/배달"], keywords: ["음료", "커피", "테이크아웃"] }
];

function normalizeRecommendationCount(value: unknown): RecommendationCount {
  const parsed = Number(value);
  return recommendationCounts.includes(parsed as RecommendationCount) ? (parsed as RecommendationCount) : 10;
}

function recommendProducts(input: {
  count: RecommendationCount;
  industry?: string;
  menuSummary?: string;
  reviewKeywords?: string[];
  reviewSummary?: string;
}) {
  const industry = input.industry?.trim() || "미분류";
  const evidenceText = [input.menuSummary, input.reviewSummary, ...(input.reviewKeywords || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ko-KR");

  return productCandidates
    .map((candidate, index) => {
      const matchedKeywords = candidate.keywords.filter((keyword) => evidenceText.includes(keyword.toLocaleLowerCase("ko-KR")));
      const industryMatched = candidate.industries.includes(industry);
      return {
        item: candidate.item,
        reason: matchedKeywords.length
          ? `메뉴·리뷰 키워드: ${matchedKeywords.slice(0, 3).join(", ")}`
          : industryMatched
            ? `${industry} 업종 기본 품목`
            : "식자재 공통 제안 품목",
        score: matchedKeywords.length * 10 + (industryMatched ? 5 : 0),
        source: matchedKeywords.length ? "menu-review" : industryMatched ? "industry" : "common",
        stableIndex: index
      };
    })
    .sort((left, right) => right.score - left.score || left.stableIndex - right.stableIndex)
    .slice(0, input.count)
    .map(({ stableIndex: _stableIndex, ...candidate }) => candidate);
}

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    drafts: await getSalesAssistantDrafts(scope.companyId)
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    companyId?: string;
    count?: number;
    industry?: string;
    menuSummary?: string;
    reviewKeywords?: string[];
    reviewSummary?: string;
  } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const count = normalizeRecommendationCount(body?.count);
  const recommendations = recommendProducts({
    count,
    industry: body?.industry,
    menuSummary: body?.menuSummary,
    reviewKeywords: Array.isArray(body?.reviewKeywords) ? body.reviewKeywords.filter((keyword): keyword is string => typeof keyword === "string") : [],
    reviewSummary: body?.reviewSummary
  });
  const hasMenuReviewEvidence = Boolean(body?.menuSummary?.trim() || body?.reviewSummary?.trim() || body?.reviewKeywords?.length);

  return NextResponse.json({
    basis: hasMenuReviewEvidence ? "menu-review-industry" : body?.industry?.trim() ? "industry" : "common",
    count,
    recommendations,
    sourceLabel: hasMenuReviewEvidence ? "실제 메뉴·리뷰 기반" : body?.industry?.trim() ? "업종 기반" : "공통 품목 기반"
  });
}
