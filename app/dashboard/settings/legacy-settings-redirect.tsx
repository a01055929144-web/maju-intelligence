"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const LEGACY_HASH_ROUTES: Record<string, string> = {
  "#business-number-settings": "/dashboard/settings/advanced",
  "#company-closure": "/dashboard/settings/advanced",
  "#company-settings": "/dashboard/settings/company",
  "#route-unit-settings": "/dashboard/settings/routes",
  "#sales-kpi-settings": "/dashboard/settings/company",
  "#staff-settings": "/dashboard/settings/staff",
  "#territory-settings": "/dashboard/settings/routes"
};

export function LegacySettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(LEGACY_HASH_ROUTES[window.location.hash] || "/dashboard/settings/company");
  }, [router]);
  return <div className="grid min-h-[40vh] place-items-center text-sm font-semibold text-slate-500">설정 화면으로 이동 중입니다.</div>;
}
