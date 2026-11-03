/**
 * 회사 정보 통합 (11/3 대표 선택). Owner Domain: organization.
 * 화면·API·저장이 같은 필드 정의를 씁니다. adminOnly 필드는 운영 계정에 보이지 않고 저장도 무시합니다.
 */
export type CompanyProfileFieldType = "text" | "textarea" | "date" | "time" | "number" | "tags" | "weekdays" | "boolean" | "select" | "file";

export type CompanyProfileField = {
  readonly key: string;
  readonly label: string;
  readonly type: CompanyProfileFieldType;
  readonly adminOnly?: boolean;
  readonly hint?: string;
  readonly options?: readonly string[];
  readonly placeholder?: string;
};

export type CompanyProfileSection = { readonly id: string; readonly title: string; readonly description?: string; readonly fields: readonly CompanyProfileField[] };

export const COMPANY_PROFILE_SECTIONS: readonly CompanyProfileSection[] = [
  {
    id: "business",
    title: "사업자 정보",
    fields: [
      { key: "owner_name", label: "대표자명", type: "text" },
      { key: "sub_business_number", label: "종사업장번호", type: "text" },
      { key: "business_conditions", label: "업태", type: "tags", placeholder: "예: 도소매" },
      { key: "business_items", label: "종목", type: "tags", placeholder: "예: 농수산물, 식자재유통" },
      { key: "founded_on", label: "설립일", type: "date" },
      { key: "main_phone", label: "대표 전화", type: "text" },
      { key: "fax", label: "팩스", type: "text" },
      { key: "email", label: "이메일", type: "text", hint: "세금계산서·연락용" },
      { key: "intro", label: "사업장 소개", type: "textarea", hint: "DM·팸플릿·주문 링크 첫 화면에 쓰입니다." },
      { key: "representative_image_path", label: "사업장 대표 이미지", type: "file" }
    ]
  },
  {
    id: "address",
    title: "주소",
    description: "창고(출발지) 주소는 아래 '출발지'에서 관리합니다.",
    fields: [
      { key: "business_postcode", label: "우편번호", type: "text" },
      { key: "business_address", label: "사업장 주소", type: "text" },
      { key: "business_address_detail", label: "상세주소", type: "text" },
      { key: "warehouse_same_as_business", label: "창고 주소가 사업장 주소와 같음", type: "boolean" }
    ]
  },
  {
    id: "documents",
    title: "서류",
    description: "비공개 보관. PDF·JPG·PNG, 10MB 이하.",
    fields: [
      { key: "business_certificate_path", label: "사업자등록증", type: "file" },
      { key: "bankbook_path", label: "통장사본", type: "file" }
    ]
  },
  {
    id: "products",
    title: "취급 품목",
    description: "대분류(농산·수산·축산 등)는 리드 설정의 '취급 품목'을 그대로 씁니다.",
    fields: [
      { key: "main_store_segments", label: "주요 거래 매장군", type: "tags", placeholder: "예: 한식, 양식, 카페" },
      { key: "signature_items", label: "차별화된 주력 품목", type: "textarea" }
    ]
  },
  {
    id: "delivery",
    title: "배송",
    description: "주문 마감 시간·최소 주문 금액은 '주문 설정'에서 관리합니다.",
    fields: [
      { key: "delivery_weekdays", label: "배송 가능 요일", type: "weekdays" },
      { key: "next_day_cutoff_time", label: "익일배송 마감시간", type: "time" },
      { key: "delivery_time_window", label: "배송 예정 시간", type: "text", placeholder: "예: 새벽 4~8시" },
      { key: "delivery_methods", label: "배송 방식", type: "tags", placeholder: "예: 자차, 택배, 퀵" },
      { key: "delivery_comment", label: "배송·주문 코멘트", type: "textarea" }
    ]
  },
  {
    id: "payment",
    title: "결제",
    fields: [
      { key: "payment_methods", label: "결제 방식", type: "tags", placeholder: "예: 계좌이체, 카드, 가상계좌" },
      { key: "payment_cycle", label: "결제 주기", type: "text", hint: "기본 '협의' — DM·견적에 그대로 쓰입니다." },
      { key: "first_order_minimum_won", label: "첫 주문 최소금액(원)", type: "number" },
      { key: "payment_comment", label: "결제 코멘트", type: "textarea" },
      { key: "settlement_bank", label: "입금 은행", type: "text" },
      { key: "settlement_account_number", label: "입금 계좌번호", type: "text" },
      { key: "settlement_account_holder", label: "예금주", type: "text" }
    ]
  },
  {
    id: "consult",
    title: "상담",
    fields: [
      { key: "holiday_notice", label: "휴무 안내", type: "textarea" },
      { key: "accepts_new_stores", label: "신규 매장 대응 가능", type: "boolean" },
      { key: "consult_weekdays", label: "상담 가능 요일", type: "weekdays" },
      { key: "consult_hours", label: "상담 가능 시간", type: "text", placeholder: "예: 09:00~18:00" }
    ]
  },
  {
    id: "admin",
    title: "관리자 전용",
    description: "운영 계정에는 보이지 않습니다.",
    fields: [
      { key: "admin_memo", label: "내부 메모", type: "textarea", adminOnly: true },
      { key: "grade", label: "등급", type: "select", options: ["", "A", "B", "C"], adminOnly: true },
      { key: "price_competitiveness", label: "가격 경쟁력", type: "select", options: ["", "높음", "보통", "낮음"], adminOnly: true },
      { key: "erp_types", label: "사용 중 ERP", type: "tags", placeholder: "예: 이카운트", adminOnly: true },
      { key: "plan_name", label: "요금제", type: "text", adminOnly: true },
      { key: "contract_on", label: "계약일", type: "date", adminOnly: true },
      { key: "trial_ends_on", label: "체험 종료일", type: "date", adminOnly: true }
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
export function sanitizeCompanyProfilePatch(input: CompanyProfileValues, isAdmin: boolean): { patch: CompanyProfileValues; error?: string } {
  const patch: CompanyProfileValues = {};
  for (const field of COMPANY_PROFILE_FIELDS) {
    if (!(field.key in input)) continue;
    if (field.adminOnly && !isAdmin) continue;
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
