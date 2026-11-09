import { StoreConnectionPanel } from "@/components/store-connection-panel";

export default async function StoreConnectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <main className="mx-auto max-w-3xl p-4"><StoreConnectionPanel
    companyId={typeof query.companyId === "string" ? query.companyId : ""}
    storeAccountId={typeof query.storeAccountId === "string" ? query.storeAccountId : ""} /></main>;
}
