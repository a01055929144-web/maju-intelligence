import { StoreMemberManagementPanel } from "@/components/store-member-management-panel";
import Link from "next/link";

export default async function StoreMembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const companyId = typeof query.companyId === "string" ? query.companyId : "";
  const storeAccountId = typeof query.storeAccountId === "string" ? query.storeAccountId : "";
  return <main className="mx-auto max-w-3xl p-4"><StoreMemberManagementPanel companyId={companyId} storeAccountId={storeAccountId} />
    <Link className="inline-flex min-h-[44px] items-center underline" href={`/store/connection?${new URLSearchParams({ companyId, storeAccountId })}`}>매장 연결 관리</Link></main>;
}
