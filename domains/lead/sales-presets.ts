export type LeadSalesPreset = {
  key: "food_distribution" | "distributor_target";
  label: string;
  industryFilters: string[];
  defaultSort: "priority" | "open_date";
  suggestedFields: string[];
  firstMessage: string;
};

export const LEAD_SALES_PRESETS: readonly LeadSalesPreset[] = [
  {
    key: "food_distribution",
    label: "식자재 유통",
    industryFilters: ["한식", "중식", "일식", "양식", "분식", "치킨", "주점", "카페·디저트", "급식"],
    defaultSort: "priority",
    suggestedFields: ["주요 사용 품목", "월 예상 사용량", "현재 매입처", "희망 연락일"],
    firstMessage: "{상호} 사장님 안녕하세요. {회사명} {담당자명}입니다. 매장에서 자주 쓰는 식자재 단가를 안내드리겠습니다."
  },
  {
    key: "distributor_target",
    label: "유통사 대상",
    industryFilters: ["축산판매", "식품소분", "식품판매", "도매", "유통"],
    defaultSort: "open_date",
    suggestedFields: ["ERP", "취급 품목", "매장 수", "매칭 상태", "중개 상태"],
    firstMessage: "{상호} 담당자님 안녕하세요. {회사명} {담당자명}입니다. 유통 상품 연계와 매장 판로 협업을 제안드립니다."
  }
] as const;
