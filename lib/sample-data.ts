export type CustomerRow = {
  companyName: string;
  customerName: string;
  region: string;
  address: string;
  industry: string;
  monthlyRevenue: number;
  lastOrderDays: number;
  visitCount: number;
  deliveryKm: number;
};

export const requiredFields = [
  { key: "customerName", label: "거래처명", aliases: ["거래처명", "상호", "고객명", "업체명", "customer", "name"] },
  { key: "region", label: "지역", aliases: ["지역", "구", "동", "시군구", "권역", "region"] },
  { key: "address", label: "주소", aliases: ["주소", "소재지", "address"] },
  { key: "industry", label: "업종", aliases: ["업종", "카테고리", "분류", "industry", "category"] },
  { key: "monthlyRevenue", label: "월매출", aliases: ["월매출", "매출", "월 거래액", "revenue", "sales"] },
  { key: "lastOrderDays", label: "최근주문일수", aliases: ["최근주문일수", "미주문일", "최종주문", "last order"] },
  { key: "visitCount", label: "월방문횟수", aliases: ["월방문횟수", "방문", "visit"] },
  { key: "deliveryKm", label: "배송거리km", aliases: ["배송거리", "거리", "km", "delivery"] }
] as const;

export type RequiredFieldKey = (typeof requiredFields)[number]["key"];
export type UploadTemplateField = {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  description?: string;
};
export type UploadTemplateType = "customer-master" | "sales-analysis";

export const customerMasterFields = [
  { key: "customerName", label: "거래처/매장 상호명", aliases: ["거래처명", "매장명", "상호", "고객명", "업체명", "customer", "name"], required: true },
  { key: "businessRegistrationNumber", label: "사업자등록번호", aliases: ["사업자등록번호", "사업자번호", "사업자", "bizno", "registration"], required: true },
  { key: "representativeName", label: "대표자명", aliases: ["대표자", "대표자명", "대표", "owner", "ceo"], required: true },
  { key: "openingDate", label: "개업일", aliases: ["개업일", "개업년월일", "open date", "opening"], required: false },
  { key: "address", label: "배송주소", aliases: ["주소", "배송주소", "소재지", "address"], required: true },
  { key: "phone", label: "연락처", aliases: ["연락처", "전화", "휴대폰", "phone", "mobile"], required: false },
  { key: "email", label: "이메일", aliases: ["이메일", "email", "메일"], required: false },
  { key: "birthDate", label: "생년월일", aliases: ["생년월일", "생일", "birth"], required: false },
  { key: "region", label: "지역", aliases: ["지역", "구", "동", "시군구", "권역", "region"], required: false },
  { key: "industry", label: "업종", aliases: ["업종", "업태", "종목", "카테고리", "분류", "industry", "category"], required: false }
] as const satisfies readonly UploadTemplateField[];

export const salesAnalysisFields = [
  { key: "customerName", label: "거래처/매장 상호명", aliases: ["거래처명", "매장명", "상호", "고객명", "업체명", "customer", "name"], required: true },
  { key: "businessRegistrationNumber", label: "사업자등록번호", aliases: ["사업자등록번호", "사업자번호", "사업자", "bizno", "registration"], required: false },
  { key: "salesDate", label: "매출일자", aliases: ["매출일자", "판매일", "거래일", "주문일", "일자", "date"], required: true },
  { key: "salesAmount", label: "매출금액", aliases: ["매출금액", "매출", "판매금액", "공급가", "합계", "amount", "sales"], required: true },
  { key: "productName", label: "품목명", aliases: ["품목", "품목명", "상품명", "제품명", "item", "product"], required: false },
  { key: "quantity", label: "수량", aliases: ["수량", "qty", "quantity"], required: false },
  { key: "region", label: "지역", aliases: ["지역", "구", "동", "시군구", "권역", "region"], required: false },
  { key: "address", label: "주소", aliases: ["주소", "배송주소", "소재지", "address"], required: false }
] as const satisfies readonly UploadTemplateField[];

export const uploadTemplates: Record<
  UploadTemplateType,
  {
    label: string;
    description: string;
    fields: readonly UploadTemplateField[];
  }
> = {
  "customer-master": {
    label: "매장 및 거래처 등록",
    description: "사업자등록증, 통장 사본, 배송주소, 대표자/연락처 등 1회 등록 후 계속 수정되는 기본정보입니다.",
    fields: customerMasterFields
  },
  "sales-analysis": {
    label: "매출 분석 데이터",
    description: "ERP별 양식이 달라도 거래처 key와 일/월/분기/반기/연 매출, 품목 이탈 분석에 필요한 거래내역입니다.",
    fields: salesAnalysisFields
  }
};

export const sampleCustomers: CustomerRow[] = [
  { companyName: "마주식자재", customerName: "성수 온반", region: "성수동", address: "서울 성동구 성수동", industry: "한식", monthlyRevenue: 420, lastOrderDays: 3, visitCount: 4, deliveryKm: 7.4 },
  { companyName: "마주식자재", customerName: "성수 국밥집", region: "성수동", address: "서울 성동구 성수동", industry: "한식", monthlyRevenue: 380, lastOrderDays: 6, visitCount: 4, deliveryKm: 8.1 },
  { companyName: "마주식자재", customerName: "강남 정식", region: "강남구", address: "서울 강남구 역삼동", industry: "한식", monthlyRevenue: 610, lastOrderDays: 2, visitCount: 5, deliveryKm: 18.3 },
  { companyName: "마주식자재", customerName: "송파 우동", region: "송파구", address: "서울 송파구 문정동", industry: "일식", monthlyRevenue: 260, lastOrderDays: 13, visitCount: 2, deliveryKm: 22.6 },
  { companyName: "마주식자재", customerName: "하남 샤브", region: "하남", address: "경기 하남시 미사동", industry: "한식", monthlyRevenue: 340, lastOrderDays: 7, visitCount: 3, deliveryKm: 25.4 },
  { companyName: "마주식자재", customerName: "망원 브런치", region: "망원동", address: "서울 마포구 망원동", industry: "카페", monthlyRevenue: 90, lastOrderDays: 19, visitCount: 1, deliveryKm: 20.8 },
  { companyName: "마주식자재", customerName: "위례 반찬", region: "위례", address: "경기 성남시 수정구", industry: "한식", monthlyRevenue: 150, lastOrderDays: 23, visitCount: 1, deliveryKm: 27.7 },
  { companyName: "마주식자재", customerName: "논현 베이커리", region: "강남구", address: "서울 강남구 논현동", industry: "베이커리", monthlyRevenue: 70, lastOrderDays: 29, visitCount: 1, deliveryKm: 17.5 },
  { companyName: "마주식자재", customerName: "성수 면옥", region: "성수동", address: "서울 성동구 성수동", industry: "한식", monthlyRevenue: 520, lastOrderDays: 4, visitCount: 4, deliveryKm: 7.8 },
  { companyName: "마주식자재", customerName: "송파 고깃집", region: "송파구", address: "서울 송파구 가락동", industry: "한식", monthlyRevenue: 470, lastOrderDays: 5, visitCount: 3, deliveryKm: 23.1 },
  { companyName: "마주식자재", customerName: "성수 덮밥", region: "성수동", address: "서울 성동구 성수동", industry: "일식", monthlyRevenue: 230, lastOrderDays: 11, visitCount: 2, deliveryKm: 8.7 },
  { companyName: "마주식자재", customerName: "하남 곰탕", region: "하남", address: "경기 하남시 덕풍동", industry: "한식", monthlyRevenue: 310, lastOrderDays: 9, visitCount: 3, deliveryKm: 24.6 }
];

export const marketPotential: Record<string, number> = {
  성수동: 214,
  강남구: 476,
  송파구: 581,
  하남: 188,
  망원동: 203,
  위례: 172,
  마포구: 388,
  영등포구: 341
};
