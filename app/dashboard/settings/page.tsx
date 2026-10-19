import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { LegacySettingsRedirect } from "./legacy-settings-redirect";

const SECTION_ROUTES: Record<string, string> = {
  advanced: "/dashboard/settings/advanced",
  company: "/dashboard/settings/company",
  staff: "/dashboard/settings/staff",
  tms: "/dashboard/settings/routes"
};

export default async function LegacyCompanySettingsPage({ searchParams }: { searchParams?: Promise<{ section?: string }> }) {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const section = (await searchParams)?.section;
  if (section && SECTION_ROUTES[section]) redirect(SECTION_ROUTES[section]);
  return <LegacySettingsRedirect />;
}
