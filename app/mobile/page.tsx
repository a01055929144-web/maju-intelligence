import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { normalizeWorkspaceRole } from "@/lib/workspace";

export default async function MobileEntryPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login?returnTo=/mobile");
  const role = normalizeWorkspaceRole(session.workspaceRole);
  redirect(role === "driver" ? "/mobile/today" : "/mobile/sales");
}
