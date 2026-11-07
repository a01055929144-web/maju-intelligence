import { StoreOwnerActivationPanel } from "@/components/store-kakao-entry";
import { storeMemberSessionEnabled } from "@/lib/auth";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";

export const dynamic = "force-dynamic";

export default async function StoreActivatePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {};
  const enabled = storeMemberSessionEnabled() || (isCiLayoutFixturesEnabled() && params.fixture === "store-owner-activation");
  return <main className="mx-auto max-w-3xl p-5"><meta name="referrer" content="no-referrer" />
    <h1 className="mb-4 text-lg font-semibold">매장 전용 개통</h1><StoreOwnerActivationPanel enabled={enabled} />
  </main>;
}
