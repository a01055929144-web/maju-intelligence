import { notFound, redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { PriceSheetsWorkspace } from "@/components/price-sheets-workspace";
export const dynamic = "force-dynamic";
export default async function PricingPage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  if (!priceSheetsEnabled()) notFound();
  const customer = await getCustomerSession();
  const admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, (await searchParams)?.companyId);
  if (!companyId || !areHoldModulesEnabled(companyId) || (customer && !canManagePriceSheets(customer))) notFound();
  return <main className="mx-auto max-w-6xl space-y-4 p-4"><h1 className="text-xl font-bold">①-2 가격표 · 마진 그룹</h1><PriceSheetsWorkspace companyId={companyId} /></main>;
}
