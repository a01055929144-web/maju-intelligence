import { redirect } from "next/navigation";
import { MobileSalesWorkspace } from "@/components/mobile-sales-workspace";
import { getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";

export default async function MobileSalesPage({ searchParams }: { searchParams?: Promise<{ mode?: string }> }) {
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");
  const mode = (await searchParams)?.mode === "new" ? "new" : "sales";

  return <MobileSalesWorkspace actorName={getCustomerOperationalName(session)} companyName={session.companyName} holdModulesEnabled={areHoldModulesEnabled(session.companyId)} initialMode={mode} kakaoMapAppKey={process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY} />;
}
