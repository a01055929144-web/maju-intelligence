// 지도 목록 패널(map-side-panel)과 워크스페이스가 같이 쓰는 순수 타입·함수. 이 파일은 워크스페이스를 import하지 않는다(순환 import·TDZ 방지).
import type { RouteOrderFields } from "@/application/route/today-route-order-projection";
import type { PermitLeadItem, RoutePlanStop } from "@/lib/store";
import type { RevenueGrade } from "@/lib/route-map-utils";

export const LEAD_STORE_AREA_FEATURE_ENABLED = process.env.NEXT_PUBLIC_LEAD_STORE_AREA_ENABLED === "true";

export type StoreRow = RoutePlanStop & RouteOrderFields & {
  accountCopyStatus: "missing" | "received";
  bankAccount: string;
  birthDate: string;
  businessCertificateStatus: "missing" | "received";
  businessRegistrationNumber: string;
  businessStatus: "active" | "closed" | "unknown";
  deliveryArea?: string;
  deliveryDriver?: string;
  deliveryVehicleId?: string;
  deliveryVehicleName?: string;
  email: string;
  grade: RevenueGrade;
  industry: string;
  markerX: number;
  markerY: number;
  memo: string;
  openingDate: string;
  phone: string;
  representativeName: string;
};

/**
 * 저장된 네이버·카카오·구글 링크가 있으면 그 링크로, 없으면 상호명+주소 검색 링크로 새 탭에서 엽니다.
 * 실제 리뷰·영업시간·메뉴는 각 플랫폼 페이지에서 확인합니다(공식 리뷰 API는 유료라 여기서는 연결만 제공).
 */
// 예전 로직으로 저장된 네이버 링크는 "상호명+상세주소" 조합 검색이라 결과가 어긋나는 경우가 많았습니다.
// 실제로 네이버 API가 확정 매칭한 링크(map.naver.com/p/search가 아닌 다른 경로)가 아니라면,
// 저장된 값 대신 항상 최신 로직(상호명 단독 검색)으로 다시 계산해서 보여줍니다.
export const isGenericNaverSearchLink = (url?: string) => {
  const trimmed = url?.trim();
  return !trimmed || /^https:\/\/map\.naver\.com\/p\/search\//.test(trimmed);
};

export function permitGradeToneClassName(grade: PermitLeadItem["grade"], unscored?: boolean) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  if (grade === "C") return "bg-slate-100 text-slate-700";
  if (unscored) return "bg-amber-50 text-amber-600";
  return "bg-slate-50 text-slate-400";
}

export function getLeadConfidence(lead: PermitLeadItem) {
  const reasons: string[] = [];
  let score = 45;
  if (lead.isActive) {
    score += 12;
    reasons.push("사업자 상태 정상");
  }
  if (lead.phone) {
    score += 12;
    reasons.push("연락처 있음");
  }
  if (lead.address) {
    score += 8;
    reasons.push("주소 확인");
  }
  if (lead.grade === "A") {
    score += 10;
    reasons.push("A등급 리드");
  } else if (lead.grade === "B") {
    score += 6;
    reasons.push("B등급 리드");
  }
  if (lead.leadPeriod === "today") {
    score += 8;
    reasons.push("오늘 신규");
  } else if (lead.leadPeriod === "week") {
    score += 5;
    reasons.push("이번 주 신규");
  }
  if ((lead.keywordVolume || 0) > 0) {
    score += 5;
    reasons.push("검색량 데이터 있음");
  }
  if ((lead.reviewCount || 0) > 0) {
    score += 4;
    reasons.push(`리뷰 ${lead.reviewCount}건`);
  }
  if (lead.isDuplicate || lead.excludeReason) score -= 20;

  const bounded = Math.max(0, Math.min(100, score));
  const label = bounded >= 82 ? "높음" : bounded >= 68 ? "보통" : "확인 필요";
  return { label, reasons: reasons.slice(0, 4), score: bounded };
}

export function getBusinessStatusLabel(status: StoreRow["businessStatus"]) {
  if (status === "active") return "정상";
  if (status === "closed") return "폐업";
  return "확인필요";
}

export function businessStatusClass(status: StoreRow["businessStatus"]) {
  if (status === "active") return "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700";
  if (status === "closed") return "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700";
  return "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700";
}
