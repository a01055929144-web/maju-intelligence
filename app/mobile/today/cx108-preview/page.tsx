import { notFound } from "next/navigation";
import { MobileDeliveryProofPanel } from "@/components/mobile-delivery-proof-panel";
import { MobileRouteList } from "@/components/mobile-route-list";
import { MobileThemeShell } from "@/components/mobile-theme-shell";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

const stops = [1, 2, 3].map((order) => ({
  address: `서울특별시 강남구 합성로 ${order}`,
  distanceKm: order,
  durationMinutes: order * 4,
  id: `10000000-0000-4000-8000-00000000000${order}`,
  name: `합성 배송지 ${order}`,
  region: "서울 강남",
}));

export default function Cx108PreviewPage() {
  if (!isCiLayoutFixturesEnabled()) notFound();
  return <main className="min-h-screen bg-slate-100 text-slate-950"><MobileThemeShell><section className="mobile-app-frame mx-auto min-h-screen w-full max-w-[480px] space-y-3 p-3 shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
    <MobileRouteList atomicOrderEnabled bulkCompleteEnabled driverName="정두영" initialStops={stops} routeArea="서울 강남" />
    <MobileDeliveryProofPanel companyId="00000000-0000-4000-8000-000000000001" companyName="합성 유통" customerId={stops[0].id} customerName={stops[0].name} deliveryDate="2026-11-18" driverName="정두영" driverRunExperienceEnabled />
  </section></MobileThemeShell></main>;
}
