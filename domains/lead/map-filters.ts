// 지도 리드 필터의 순수 계산(M3a, 동작 변화 없음). 화면(칩·팝오버·상태)은 지도 파일에, 계산은 여기에 둔다.
// 폐업 판정은 isClosedLead 한 곳(domains/lead/closed-lead.ts)을 그대로 쓴다.
import { isClosedLead } from "./closed-lead";
import { toLeadStageValue } from "./lead-status";
import { isStoreAreaInRange, type StoreAreaRange } from "./store-area";

export type LeadOpenDateFilterMode = "all" | "year" | "month" | "custom" | "missing";
type LeadDateFields = { readonly openDate?: string | null; readonly permitDate?: string | null };

/** 값이 여러 개면 "|"로 이어 붙인 문자열 필터(기존 저장 필터와 호환)를 나눈다. */
export function splitMultiFilter(value: string) {
  return value ? value.split("|").map((item) => item.trim()).filter(Boolean) : [];
}

export function toggleMultiFilter(value: string, item: string) {
  const current = splitMultiFilter(value);
  return (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]).join("|");
}

// 유통사 리드는 인허가/개업일이 없어 모두 "sales"로 분류되므로 유통사 지도는 신규/영업 구분 필터를 적용하지 않습니다.
export function matchesMapLeadType(leadType: string, filter: string, distributor: boolean) {
  return distributor || filter === "all" || leadType === filter;
}

const SIDO_PREFIX_PATTERN =
  /^(서울특별시|서울|부산광역시|부산|대구광역시|대구|인천광역시|인천|광주광역시|광주|대전광역시|대전|울산광역시|울산|세종특별자치시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주)\s*/;

// 2026-09-12 버그 수정("지역 시군구 필터가 값이 제대로 안들어 간 경우가 있어"): 세종특별자치시는
// 우리나라에서 유일하게 시/도 바로 아래에 시/군/구 단위 없이 읍/면/동으로 바로 이어지는 광역
// 행정구역입니다. 아래 SIDO_PREFIX_PATTERN으로 "세종특별자치시"/"세종"을 떼어내고 나면 그다음
// 토큰은 "조치원읍"·"한누리대로" 같은 읍/면/동/도로명이라 (시|군|구)로 끝나는 패턴에 안 걸려
// sigungu가 항상 빈 문자열이 되고, 그 결과 세종 리드는 "지역" 드롭다운에 아예 나타나지 않고
// 다른 지역을 고르면 목록에서도 조용히 사라집니다. 더 나쁘게는, 주소가 축약형 "세종시 ..."로
// 시작하면 SIDO_PREFIX_PATTERN이 "세종"만 떼어내(원본에 "세종특별자치시"가 아니라 "세종시"라고만
// 적혀 있어 전체 일치가 안 됨) 그 뒤에 남는 "시" 한 글자가 (시|군|구)로 끝나는 토큰으로 오인식되어
// sigungu="시"라는 의미 없는 값이 들어갑니다. 세종은 시/군/구 단위가 없다는 점 자체가 다른
// 광역단체와 다르므로, 별도 분기로 광역단체 이름 자체를 시군구값으로 취급합니다.
const SEJONG_PREFIX_PATTERN = /^세종(특별자치시|시)?(\s|$)/;

/** 도로명주소 문자열에서 시군구/동을 뽑아 지도 리드를 지역별로 묶는 데 씁니다(2026-08-24 피드백:
 * "시군구, 동 구분하여 리드 구분을 하게끔 만들것" — 네이버 부동산의 지역 드릴다운 참고). 정확한
 * 행정구역 API 없이 문자열 패턴만으로 추출하는 근사치라, 시/군/구가 겹치는 드문 표기(고양시
 * 일산동구 등)는 시 단위까지만 잡힐 수 있습니다 — 그 정도 오차는 지도 위 대략적인 지역 구분
 * 용도로는 괜찮다고 판단했습니다. */
export function parseLeadRegion(address?: string): { dong: string; sigungu: string } {
  const trimmed = (address || "").trim();
  if (!trimmed) return { dong: "", sigungu: "" };

  // 동/읍/면/가 명은 도로명주소 맨 끝 괄호 안에 병기되는 경우가 많습니다:
  // "... 88 1층 (성수동1가)", "... 102동 205호 (마장동, 라봄 성동)".
  const parenMatch = trimmed.match(/\(([^()]*)\)\s*$/);
  const dongRaw = parenMatch?.[1]?.split(",")[0]?.trim() || "";
  const dong = /(동|리|가)\d*$/.test(dongRaw) ? dongRaw : "";

  if (SEJONG_PREFIX_PATTERN.test(trimmed)) {
    return { dong, sigungu: "세종특별자치시" };
  }

  const withoutSido = trimmed.replace(SIDO_PREFIX_PATTERN, "").trim();
  const firstToken = withoutSido.split(/\s+/)[0] || "";
  const sigungu = /(시|군|구)$/.test(firstToken) ? firstToken : "";

  return { dong, sigungu };
}

// 2026-09-07 피드백("신규리드와 영업리드는 구분하면 좋을 것 같다는 생각이 들어") 대응입니다.
// 이 회사의 리드 개념(앞선 피드백 정리) - 신규리드: 개업일자(최신 일자)가 확인되면 신생
// 사업자로 봄. 영업리드: 개업일은 몰라도 검색량이 많으면 매출이 높을 거래처로 보고 영업
// 타겟팅함. ingest 시점에 next_action_reasons에 문구로만 박혀 있던 것(리드가 언제 적재됐는지에
// 따라 최신화가 안 될 수 있음)과 달리, 여기서는 매번 openDate/permitDate 원본값으로 직접
// 재계산합니다 — 그래서 예전에 잘못 적재된 리드도(위 ingestPermitLeadRows의 isNewLead 계산
// 버그 수정 전에 들어온 리드 포함) 화면에서는 항상 정확하게 분류됩니다.
const NEW_LEAD_TYPE_MAX_AGE_DAYS = 90;
export type PermitLeadType = "new" | "sales";
export function getPermitLeadType(lead: LeadDateFields): PermitLeadType {
  const dateText = lead.openDate || lead.permitDate;
  if (!dateText) return "sales";
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return "sales";
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEW_LEAD_TYPE_MAX_AGE_DAYS);
  return date >= cutoff ? "new" : "sales";
}

export function getPermitLeadOpenDate(lead: LeadDateFields) {
  const value = lead.openDate || lead.permitDate || "";
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

export function isPermitLeadInOpenDateFilter(
  lead: LeadDateFields,
  mode: LeadOpenDateFilterMode,
  year: string,
  month: string,
  startDate: string,
  endDate: string
) {
  if (mode === "all") return true;
  const openDate = getPermitLeadOpenDate(lead);
  if (mode === "missing") return !openDate;
  if (!openDate) return false;
  if (mode === "year") return Boolean(year) && openDate.startsWith(`${year}-`);
  if (mode === "month") return Boolean(month) && openDate.startsWith(month);
  if (!startDate && !endDate) return true;
  if (startDate && openDate < startDate) return false;
  if (endDate && openDate > endDate) return false;
  return true;
}

export const PERMIT_LEAD_TYPE_OPTIONS: Array<{ label: string; value: "all" | PermitLeadType }> = [
  { label: "전체", value: "all" },
  { label: "신규리드", value: "new" },
  { label: "영업리드", value: "sales" }
];

export type MapFilterLead = LeadDateFields & {
  readonly status?: string | null;
  readonly permitStatus?: string | null;
  readonly industryPrimary?: string | null;
  readonly address?: string | null;
  readonly storeAreaSqm?: number | null;
};

/** "활성/숨김" 1차 분리 — 숨김 보기는 status가 "제외"인 것만, 활성 보기는 그 외. 폐업 리드는 켰을 때만 포함. */
export function scopeLeadsByStatus<T extends MapFilterLead>(leads: readonly T[], options: { showDismissed: boolean; showClosed: boolean }): T[] {
  return leads.filter((lead) => (options.showDismissed ? lead.status === "제외" : lead.status !== "제외") && (options.showClosed || !isClosedLead({ permitStatus: lead.permitStatus, status: lead.status })));
}

export type MapLeadFilterOptions<T> = {
  readonly typeFilter: "all" | PermitLeadType;
  readonly distributorTarget: boolean;
  readonly industry: string;
  readonly stage: string;
  /** 규모 필터는 스위치가 꺼져 있으면 빈 값으로 넘긴다. */
  readonly areaRange: StoreAreaRange | "";
  readonly reminderOnly: boolean;
  readonly hasReminder: (lead: T) => boolean;
  readonly openDateStart: string;
  readonly openDateEnd: string;
  readonly regionSigungu: string;
  readonly regionDong: string;
};

export function filterMapLeads<T extends MapFilterLead>(leads: readonly T[], o: MapLeadFilterOptions<T>): T[] {
  if ((o.typeFilter === "all" || o.distributorTarget) && !o.industry && !o.stage && !o.areaRange && !o.reminderOnly && !o.openDateStart && !o.openDateEnd && !o.regionSigungu) return leads as T[];
  return leads.filter((lead) => {
    if (!matchesMapLeadType(getPermitLeadType(lead), o.typeFilter, o.distributorTarget)) return false;
    if (o.industry && !splitMultiFilter(o.industry).includes(lead.industryPrimary || "미분류")) return false;
    if (o.stage && !splitMultiFilter(o.stage).includes(toLeadStageValue(lead.status))) return false;
    if (o.areaRange && !isStoreAreaInRange(lead.storeAreaSqm, o.areaRange)) return false;
    if (o.reminderOnly && !o.hasReminder(lead)) return false;
    if (o.openDateStart || o.openDateEnd) {
      if (!isPermitLeadInOpenDateFilter(lead, "custom", "", "", o.openDateStart, o.openDateEnd)) return false;
    }
    if (o.regionSigungu) {
      const region = parseLeadRegion(lead.address || undefined);
      if (!splitMultiFilter(o.regionSigungu).includes(region.sigungu)) return false;
      if (o.regionDong && region.dong !== o.regionDong) return false;
    }
    return true;
  });
}
