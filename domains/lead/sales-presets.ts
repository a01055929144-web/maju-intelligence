export type LeadSalesPreset = {
  key: "food_distribution" | "distributor_target";
  label: string;
  industryFilters: string[];
  defaultSort: "priority" | "open_date";
  suggestedFields: string[];
  firstMessage: string;
  contactTiming: { startDay: number; endDay: number; rationale: string } | null;
  quoteContent: string;
};

export const LEAD_SALES_PRESETS: readonly LeadSalesPreset[] = [
  {
    key: "food_distribution",
    label: "식자재 유통",
    industryFilters: ["한식", "중식", "일식", "양식", "분식", "치킨", "주점", "카페·디저트", "급식"],
    defaultSort: "priority",
    suggestedFields: ["주요 사용 품목", "월 예상 사용량", "현재 매입처", "희망 연락일"],
    firstMessage: "{상호} 사장님 안녕하세요. {회사명} {담당자명}입니다. 매장에서 자주 쓰는 식자재 단가를 안내드리겠습니다.",
    contactTiming: {
      startDay: 0,
      endDay: 60,
      rationale: "인허가 직후부터 개업 초기 2개월은 공급처를 처음 정하거나 실제 사용량에 맞춰 교체하는 시기라 우선 연락합니다."
    },
    quoteContent: "매장 업종별 자주 쓰는 품목과 규격·판매 단가를 한 장으로 제안"
  },
  {
    key: "distributor_target",
    label: "유통사 대상",
    industryFilters: ["축산판매", "식품소분", "식품판매", "도매", "유통"],
    defaultSort: "open_date",
    suggestedFields: ["ERP", "취급 품목", "매장 수", "매칭 상태", "중개 상태"],
    firstMessage: "{상호} 담당자님 안녕하세요. {회사명} {담당자명}입니다. 유통 상품 연계와 매장 판로 협업을 제안드립니다.",
    contactTiming: null,
    quoteContent: "취급 품목·공급 가능 지역·거래 조건을 기준으로 매장 판로 연계를 제안"
  }
] as const;
