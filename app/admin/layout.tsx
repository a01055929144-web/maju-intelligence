import type { ReactNode } from "react";
import { AdminAppShell } from "@/components/admin-app-shell";
import { getAdminSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const session = await getAdminSession();
  return session ? <AdminAppShell session={session}>{children}</AdminAppShell> : children;
}
