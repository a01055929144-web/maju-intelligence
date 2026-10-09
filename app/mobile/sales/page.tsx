import { redirect } from "next/navigation";
import { MobileSalesWorkspace } from "@/components/mobile-sales-workspace";
import { getCustomerOperationalName, getCustomerSession } from "@/lib/auth";

export default async function MobileSalesPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");

  return <MobileSalesWorkspace actorName={getCustomerOperationalName(session)} companyName={session.companyName} />;
}
