import { notFound } from "next/navigation";
import { RoleSettingsPanel } from "@/app/dashboard/settings/role-settings-panel";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

export default function RoleSettingsPreviewPage() {
  if (!isCiLayoutFixturesEnabled()) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-7xl bg-slate-50 p-4 sm:p-8">
      <RoleSettingsPanel initialData={{
        currentUserId: "20000000-0000-4000-8000-000000000001",
        members: [
          { email: "owner@maju.local", groupKey: "owner", name: "김대표", overrides: {}, userId: "20000000-0000-4000-8000-000000000001" },
          { email: "sales@maju.local", groupKey: "sales", name: "박영업", overrides: {}, userId: "20000000-0000-4000-8000-000000000002" },
          { email: "delivery@maju.local", groupKey: "delivery", name: "이배송", overrides: {}, userId: "20000000-0000-4000-8000-000000000003" }
        ]
      }} />
    </main>
  );
}
