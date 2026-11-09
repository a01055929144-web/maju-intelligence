import { StoreOwnerActivationPanel } from "@/components/store-kakao-entry";
import { getStoreOwnerActivationProof, storeMemberSessionEnabled } from "@/lib/auth";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";
import { PublicStoreTestBanner } from "@/components/public-store-test-banner";

export const dynamic = "force-dynamic";

export default async function StoreActivatePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {};
  const enabled = storeMemberSessionEnabled() || (isCiLayoutFixturesEnabled() && params.fixture === "store-owner-activation");
  const proof = params.profile === "1" ? await getStoreOwnerActivationProof() : null;
  return <main className="mx-auto max-w-3xl p-5"><meta name="referrer" content="no-referrer" />
    <PublicStoreTestBanner />
    <h1 className="mb-4 text-lg font-semibold">매장 전용 개통</h1><StoreOwnerActivationPanel enabled={enabled} profileStep={params.profile === "1"} initialStorePhone={proof?.stage === "profile" ? proof.storePhone : undefined} />
  </main>;
}
