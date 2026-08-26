import { redirect } from "next/navigation";
import { getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";

export default async function TodayRoutePage({ searchParams }: { searchParams?: Promise<{ companyId?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (!customerSession && adminSession && !resolvedSearchParams?.companyId) redirect("/admin/companies");

  const companyId = resolvePageCompanyId(customerSession, adminSession, resolvedSearchParams?.companyId);
  const params = new URLSearchParams({ view: "course" });
  if (adminSession && !customerSession && companyId) params.set("companyId", companyId);
  const dashboardHref = `/dashboard?${params.toString()}`;
  redirect(dashboardHref);
}
