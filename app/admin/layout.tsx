import type { ReactNode } from "react";
import { AdminAppShell } from "@/components/admin-app-shell";
import { getAdminSession } from "@/lib/auth";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";
import { isAdminMapOverviewEnabled } from "@/lib/feature-modules";

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const session = await getAdminSession();
  return session ? <AdminAppShell adminMapEnabled={isAdminMapOverviewEnabled() || isCiLayoutFixturesEnabled()} session={session}>{children}</AdminAppShell> : children;
}
