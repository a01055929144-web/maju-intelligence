import { StoreMemberManagementPanel } from "@/components/store-member-management-panel";

export default async function StoreMembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const companyId = typeof query.companyId === "string" ? query.companyId : "";
  const storeAccountId = typeof query.storeAccountId === "string" ? query.storeAccountId : "";
  return <main className="mx-auto max-w-3xl p-4"><StoreMemberManagementPanel companyId={companyId} storeAccountId={storeAccountId} /></main>;
}
