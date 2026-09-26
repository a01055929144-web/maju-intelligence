import { redirect } from "next/navigation";
import { AdminBillingWorkspace } from "@/components/admin-billing-workspace";
import { getAdminSession } from "@/lib/auth";
import { listSubscriptionsForAdmin } from "@/lib/store";
import { AdminPageHeader } from "../admin-page-header";

export default async function AdminBillingPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const result = await listSubscriptionsForAdmin()
    .then((subscriptions) => ({ loadError: "", subscriptions }))
    .catch(() => ({ loadError: "결제 정보를 불러오지 못했습니다. 잠시 후 다시 시도하거나 시스템 점검에서 연결 상태를 확인해주세요.", subscriptions: [] }));

  return (
    <div className="min-h-screen bg-slate-50/60">
      <AdminPageHeader active="billing" badge="결제 관리" session={session} subtitle="고객사별 월 이용료와 자동결제 상태" title="결제 관리" />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-4">
        <AdminBillingWorkspace initialSubscriptions={result.subscriptions} loadError={result.loadError} />
      </main>
    </div>
  );
}
