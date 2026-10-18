import { redirect } from "next/navigation";
import { MobileSalesWorkspace } from "@/components/mobile-sales-workspace";
import { getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";

export default async function MobileSalesPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");

  return <MobileSalesWorkspace actorName={getCustomerOperationalName(session)} companyName={session.companyName} holdModulesEnabled={areHoldModulesEnabled(session.companyId)} />;
}
