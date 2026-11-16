import { extractLeadAdministrativeSubarea } from "../lead/lead-policy";
import { KOREAN_GENERAL_GU_AREAS, KOREAN_PROVINCES } from "../../lib/korean-administrative-areas";

const PROVINCE_ALIASES: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도"
};

/** 주소에서 권역 매칭에 쓰는 시·군·구 키를 추출합니다. 상세주소는 의도적으로 제외합니다. */
export function extractCustomerAdministrativeArea(address?: string | null) {
  const tokens = (address || "").replace(/[(),]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const first = PROVINCE_ALIASES[tokens[0]] || tokens[0];
  const localIndex = tokens.findIndex((token, index) => index > 0 && /(?:시|군|구)$/.test(token));
  if (localIndex < 0) return "";
  return `${first} ${tokens[localIndex]}`;
}

export function extractCustomerAdministrativeSubarea(address?: string | null) {
  return extractLeadAdministrativeSubarea(address);
}

export function normalizeSelectableSalesArea(value?: string | null) {
  const trimmed = (value || "").replace(/\s+/g, " ").trim();
  if (KOREAN_PROVINCES.includes(trimmed)) return trimmed;
  const subarea = extractCustomerAdministrativeSubarea(value);
  if (subarea) {
    const parent = extractCustomerAdministrativeArea(value);
    if ((KOREAN_GENERAL_GU_AREAS[parent] || []).some((gu) => subarea === `${parent} ${gu}`)) return subarea;
  }
  return extractCustomerAdministrativeArea(value);
}

export function resolveEffectiveSalesAreas(
  explicitLabels: Array<string | null | undefined>,
  defaultLabels: Array<string | null | undefined>
) {
  const explicitAreas = Array.from(new Set(explicitLabels.map(normalizeSelectableSalesArea).filter(Boolean)));
  if (explicitAreas.length) return explicitAreas;
  return Array.from(new Set(defaultLabels.map(normalizeSelectableSalesArea).filter(Boolean)));
}

export function normalizeAdministrativeArea(value?: string | null) {
  const extracted = extractCustomerAdministrativeArea(value);
  if (extracted) return extracted.replace(/\s+/g, " ").trim();
  const tokens = (value || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  tokens[0] = PROVINCE_ALIASES[tokens[0]] || tokens[0];
  return tokens.join(" ");
}
