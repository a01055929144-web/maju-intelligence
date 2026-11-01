"use client";

import { useRouter } from "next/navigation";
import { KakaoAddressMap, type KakaoSalesAreaStat } from "@/components/kakao-address-map";
import type { AdminMapView } from "@/application/analytics/admin-map-overview";

export function AdminAreaKakaoMap({ district, hrefForDistrict, province, stats, view }: {
  readonly district: string;
  readonly hrefForDistrict: string;
  readonly province: string;
  readonly stats: ReadonlyArray<KakaoSalesAreaStat>;
  readonly view: AdminMapView;
}) {
  const router = useRouter();
  const metric = view === "leads" ? "recentLeads" : view;
  return (
    <KakaoAddressMap
      fallbackReason="카카오 지도를 불러오지 못했습니다. 지도 키와 허용 도메인을 확인해주세요."
      mapClassName="h-[420px] rounded-none border-0 sm:h-[520px]"
      markers={[]}
      salesAreaBoundary={{
        canManage: false,
        inspectOnly: true,
        metric,
        onToggle: (administrativeArea) => router.push(`${hrefForDistrict}${encodeURIComponent(administrativeArea)}`),
        province,
        selectedAreas: district ? [district] : [],
        stats
      }}
      showList={false}
    />
  );
}
