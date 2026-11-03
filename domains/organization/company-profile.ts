/**
 * 회사 정보 통합 (11/3 대표 선택). Owner Domain: organization.
 * 화면·API·저장이 같은 필드 정의를 씁니다. adminOnly 필드는 운영 계정에 보이지 않고 저장도 무시합니다.
 */
export type CompanyProfileFieldType = "text" | "textarea" | "date" | "time" | "number" | "tags" | "checks" | "checksOther" | "weekdays" | "boolean" | "select" | "file" | "contacts" | "address" | "mobile";

export type CompanyProfileField = {
  readonly key: string;
  readonly label: string;
  readonly type: CompanyProfileFieldType;
  readonly adminOnly?: boolean;
  /** 대표(owner)와 MAJU 관리자만 수정. 직원·운영 관리자는 보기만. (11/3 대표 피드백으로 대표 수정 허용) */
  readonly locked?: boolean;
  /** 첫 로그인 필수 입력. */
  readonly required?: boolean;
  readonly hint?: string;
  readonly options?: readonly string[];
  readonly placeholder?: string;
};

export type CompanyProfileSection = { readonly id: string; readonly title: string; readonly description?: string; readonly fields: readonly CompanyProfileField[] };

export const BUSINESS_CONDITION_OPTIONS = ["도소매", "도매", "소매", "제조", "서비스"] as const;
export const BUSINESS_ITEM_OPTIONS = ["식자재유통", "농산물", "수산물", "축산물", "공산품", "수입식자재", "주류·음료", "일회용품·소모품"] as const;
export const MOBILE_PHONE_PATTERN = /^01[016789]-?\d{3,4}-?\d{4}$/;

export const STORE_SEGMENT_OPTIONS = ["한식", "중식", "일식", "양식", "분식·김밥·도시락", "아시안", "카페·디저트·베이커리", "주점", "치킨·피자·패스트푸드", "뷔페·단체급식", "프랜차이즈"] as const;
export const PAYMENT_CYCLE_OPTIONS = ["협의", "선결제", "당일", "7일", "10일", "15일", "월말"] as const;

export const COMPANY_PROFILE_SECTIONS: readonly CompanyProfileSection[] = [
  {
    id: "basic",
    title: "기본",
    fields: [
      // 11/3 23:44: 종사업장번호(매장용)·연락 담당자 제거. 사업장 주소는 카카오 주소 검색, 대표 전화는 휴대폰.
      { key: "owner_name", label: "대표자", type: "text", locked: true },
      { key: "main_phone", label: "대표 휴대폰", type: "mobile", required: true, hint: "카카오로 가입했다면 카카오 휴대폰 번호가 먼저 채워집니다." },
      { key: "business_conditions", label: "업태", type: "checksOther", locked: true, options: BUSINESS_CONDITION_OPTIONS },
      { key: "business_items", label: "종목", type: "checksOther", locked: true, options: BUSINESS_ITEM_OPTIONS },
      { key: "founded_on", label: "설립일", type: "date", locked: true },
      { key: "business_address", label: "사업장 주소", type: "address", locked: true },
      { key: "business_address_detail", label: "사업장 상세주소", type: "text", locked: true },
      { key: "email", label: "이메일", type: "text", hint: "세금계산서·연락용" },
      { key: "fax", label: "팩스", type: "text" },
      { key: "intro", label: "회사 소개", type: "textarea", hint: "DM·견적서·주문 링크 첫 화면에 쓰입니다." },
      { key: "representative_image_path", label: "대표 이미지", type: "file" },
      { key: "business_certificate_path", label: "사업자등록증", type: "file", locked: true },
      { key: "bankbook_path", label: "통장사본", type: "file", locked: true }
    ]
  },
  {
    id: "products",
    title: "품목",
    description: "취급 품목 대분류는 리드 설정의 '취급 품목'과 같은 값입니다.",
    fields: [
      { key: "main_store_segments", label: "주요 거래 매장군", type: "checks", options: STORE_SEGMENT_OPTIONS },
      { key: "signature_items", label: "차별화된 주력 품목", type: "textarea" }
    ]
  },
  {
    id: "delivery",
    title: "배송",
    description: "주문 마감 시간·최소 주문 금액은 '주문 설정'에서 관리합니다.",
    fields: [
      { key: "delivery_weekdays", label: "배송 요일", type: "weekdays", required: true },
      { key: "next_day_cutoff_time", label: "익일배송 마감", type: "time" },
      { key: "delivery_time_window", label: "배송 시간대", type: "text", placeholder: "예: 04:00~08:00" },
      { key: "delivery_methods", label: "배송 방식", type: "checks", options: ["직배송", "택배"] },
      { key: "delivery_regions", label: "배송 지역", type: "tags", placeholder: "예: 서울 강남구, 서울 서초구", hint: "저장하면 영업 지역(리드 수집)에 자동으로 추가됩니다." },
      { key: "delivery_comment", label: "배송·주문 코멘트", type: "textarea" }
    ]
  },
  {
    id: "payment",
    title: "결제",
    fields: [
      { key: "payment_methods", label: "결제 방식", type: "checks", options: ["계좌이체", "카드", "현금"] },
      { key: "payment_cycle", label: "결제 주기", type: "select", options: PAYMENT_CYCLE_OPTIONS, required: true, hint: "DM·견적서에 그대로 쓰입니다." },
      { key: "first_order_minimum_won", label: "첫 주문 최소금액(원)", type: "number" },
      { key: "payment_comment", label: "결제 코멘트", type: "textarea" },
      { key: "settlement_bank", label: "입금 은행", type: "text", locked: true },
      { key: "settlement_account_number", label: "입금 계좌번호", type: "text", locked: true },
      { key: "settlement_account_holder", label: "예금주", type: "text", locked: true }
    ]
  },
  {
    id: "consult",
    title: "상담",
    fields: [
      { key: "consult_weekdays", label: "상담 요일", type: "weekdays" },
      { key: "consult_hours", label: "상담 시간", type: "text", placeholder: "예: 09:00~18:00" },
      { key: "chat_inquiry_available", label: "채팅 문의 가능", type: "boolean" },
      { key: "accepts_new_stores", label: "신규 매장 대응 가능", type: "boolean" },
      { key: "holiday_notice", label: "휴무 안내", type: "textarea" }
    ]
  },
  {
    id: "admin",
    title: "관리자 메모",
    description: "운영 계정에는 보이지 않습니다.",
    fields: [
      { key: "grade", label: "등급", type: "select", options: ["", "A", "B", "C"], adminOnly: true },
      { key: "price_competitiveness", label: "가격 경쟁력", type: "select", options: ["", "높음", "보통", "낮음"], adminOnly: true },
      { key: "erp_types", label: "사용 중 ERP", type: "tags", placeholder: "예: 이카운트", adminOnly: true },
      { key: "plan_name", label: "요금제", type: "text", adminOnly: true },
      { key: "contract_on", label: "계약일", type: "date", adminOnly: true },
      { key: "trial_ends_on", label: "체험 종료일", type: "date", adminOnly: true },
      { key: "admin_memo", label: "내부 메모", type: "textarea", adminOnly: true }
    ]
  }
];

export const COMPANY_PROFILE_FIELDS: readonly CompanyProfileField[] = COMPANY_PROFILE_SECTIONS.flatMap((section) => section.fields);
export const COMPANY_PROFILE_FILE_KEYS = COMPANY_PROFILE_FIELDS.filter((field) => field.type === "file").map((field) => field.key);
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const COMPANY_DOCUMENT_BUCKET = "company-documents";
export const COMPANY_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const COMPANY_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export type CompanyProfileValues = Record<string, unknown>;

export function visibleCompanyProfileSections(isAdmin: boolean) {
  return COMPANY_PROFILE_SECTIONS.map((section) => ({ ...section, fields: section.fields.filter((field) => isAdmin || !field.adminOnly) }))
    .filter((section) => section.fields.length > 0);
}

/** 사용자가 보낸 값을 필드 정의대로 정리합니다. 알 수 없는 키·권한 없는 키·파일 경로는 버립니다. */
export function sanitizeCompanyProfilePatch(input: CompanyProfileValues, isAdmin: boolean, canEditLocked = isAdmin): { patch: CompanyProfileValues; error?: string } {
  const patch: CompanyProfileValues = {};
  for (const field of COMPANY_PROFILE_FIELDS) {
    if (!(field.key in input)) continue;
    if (field.adminOnly && !isAdmin) continue;
    if (field.locked && !canEditLocked) continue;
    if (field.type === "file") continue; // 파일은 업로드 API로만 바꿉니다.
    const raw = input[field.key];
    switch (field.type) {
      case "text":
      case "textarea": {
        const value = typeof raw === "string" ? raw.trim() : "";
        const max = field.type === "textarea" ? 2000 : 200;
        if (value.length > max) return { patch, error: `${field.label}은(는) ${max}자 이하로 입력해 주세요.` };
        patch[field.key] = value || (field.key === "payment_cycle" ? "협의" : null);
        break;
      }
      case "select": {
        const value = typeof raw === "string" ? raw : "";
        if (field.options && !field.options.includes(value)) return { patch, error: `${field.label} 값을 확인해 주세요.` };
        patch[field.key] = value || null;
        break;
      }
      case "date": {
        const value = typeof raw === "string" ? raw : "";
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { patch, error: `${field.label} 날짜 형식을 확인해 주세요.` };
        patch[field.key] = value || null;
        break;
      }
      case "time": {
        const value = typeof raw === "string" ? raw : "";
        if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return { patch, error: `${field.label} 시간 형식을 확인해 주세요.` };
        patch[field.key] = value || null;
        break;
      }
      case "number": {
        if (raw === "" || raw === null || raw === undefined) { patch[field.key] = null; break; }
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) return { patch, error: `${field.label} 숫자를 확인해 주세요.` };
        patch[field.key] = Math.round(value);
        break;
      }
      case "boolean":
        patch[field.key] = Boolean(raw);
        break;
      case "tags": {
        const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
        patch[field.key] = Array.from(new Set(list.map((item) => String(item).trim()).filter(Boolean))).slice(0, 20);
        break;
      }
      case "mobile": {
        const value = typeof raw === "string" ? raw.trim() : "";
        if (value && !MOBILE_PHONE_PATTERN.test(value)) return { patch, error: `${field.label}는 010으로 시작하는 휴대폰 번호로 입력해 주세요.` };
        patch[field.key] = value || null;
        break;
      }
      case "address": {
        const value = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
        patch[field.key] = value || null;
        if ("business_postcode" in input) patch.business_postcode = String(input.business_postcode || "").replace(/[^\d]/g, "").slice(0, 6) || null;
        break;
      }
      case "checksOther": {
        const list = Array.isArray(raw) ? raw.map((item) => String(item).trim()).filter(Boolean) : [];
        patch[field.key] = Array.from(new Set(list.map((item) => item.slice(0, 30)))).slice(0, 12);
        break;
      }
      case "checks": {
        const list = Array.isArray(raw) ? raw.map(String) : [];
        patch[field.key] = (field.options || []).filter((option) => list.includes(option));
        break;
      }
      case "contacts": {
        const list = Array.isArray(raw) ? raw : [];
        patch[field.key] = list.slice(0, 5).map((item) => {
          const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          return { name: String(row.name || "").trim().slice(0, 40), phone: String(row.phone || "").trim().slice(0, 30), hours: String(row.hours || "").trim().slice(0, 60) };
        }).filter((row) => row.name || row.phone);
        break;
      }
      case "weekdays": {
        const list = Array.isArray(raw) ? raw : [];
        patch[field.key] = Array.from(new Set(list.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
        break;
      }
    }
  }
  return { patch };
}

/** 운영 계정에 내려줄 때 관리자 전용 값을 지웁니다. */
export function redactCompanyProfile(values: CompanyProfileValues, isAdmin: boolean) {
  if (isAdmin) return values;
  const out: CompanyProfileValues = {};
  for (const [key, value] of Object.entries(values)) {
    const field = COMPANY_PROFILE_FIELDS.find((item) => item.key === key);
    if (field?.adminOnly) continue;
    out[key] = value;
  }
  return out;
}

export const COMPANY_PROFILE_PROGRESS_KEYS = [
  "main_phone", "business_address", "intro", "main_store_segments", "signature_items", "delivery_weekdays",
  "delivery_time_window", "delivery_regions", "payment_methods", "payment_cycle", "consult_hours", "representative_image_path"
] as const;

/** 회사 정보 입력 진행률(영업 정확도에 영향을 주는 12개 기준). */
export function companyProfileProgress(values: CompanyProfileValues) {
  const filled = COMPANY_PROFILE_PROGRESS_KEYS.filter((key) => {
    const value = values[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;
  return { filled, total: COMPANY_PROFILE_PROGRESS_KEYS.length };
}
