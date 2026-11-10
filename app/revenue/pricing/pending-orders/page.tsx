import { notFound,redirect } from "next/navigation";
import { getAdminSession,getCustomerSession,resolvePageCompanyId } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { pendingOrderInboxEnabled } from "@/lib/pricing/pending-order-inbox";
import { PendingOrderInbox } from "@/components/pending-order-inbox";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

export const dynamic="force-dynamic";
export default async function PendingOrdersPage({searchParams}:{searchParams?:Promise<{companyId?:string;fixture?:string}>}) {
  const params=await searchParams;
  if(process.env.CI==="true"&&isCiLayoutFixturesEnabled()&&params?.fixture==="pending-orders")
    return <main className="mx-auto max-w-6xl p-4"><PendingOrderInbox companyId="00000000-0000-4000-8000-000000000001"/></main>;
  if(!priceSheetsEnabled()||!storeOrderingEnabled()||process.env.STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED!=="true")notFound();
  const customer=await getCustomerSession(),admin=await getAdminSession();
  if(!customer&&!admin)redirect("/dashboard/login");
  const companyId=resolvePageCompanyId(customer,admin,params?.companyId);
  if(!companyId||!pendingOrderInboxEnabled(companyId)||(customer&&!canManagePriceSheets(customer)))notFound();
  return <main className="mx-auto max-w-6xl p-4"><PendingOrderInbox companyId={companyId}/></main>;
}
