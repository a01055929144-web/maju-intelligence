import { redirect } from "next/navigation";
import { AdminBillingWorkspace } from "@/components/admin-billing-workspace";
import { getAdminSession } from "@/lib/auth";
import { listSubscriptionsForAdmin } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";

export default async function AdminBillingPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const subscriptions = await listSubscriptionsForAdmin().catch(() => []);

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AdminPageHeader active="billing" badge="결제 관리" session={session} subtitle="고객사별 월 이용료와 자동결제 상태" title="결제 관리" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-4">
        <AdminBillingWorkspace initialSubscriptions={subscriptions} />
      </main>
    </div>
  );
}
