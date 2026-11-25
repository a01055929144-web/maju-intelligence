import { redirect } from "next/navigation";
import { getStoreSession } from "@/lib/auth";
import { listPhoneLinkCandidates } from "@/lib/store/07-store-phone-link";
import { StorePhoneLinkConfirm } from "@/components/store-phone-link-confirm";

export const dynamic = "force-dynamic";

/** CX-146: 카카오 번호와 같은 '점주 휴대폰'이 등록된 매장을 한 번 확인한 뒤 연결한다. */
export default async function StorePhoneLinkPage() {
  const session = await getStoreSession();
  if (!session) redirect("/store");
  let candidates: Awaited<ReturnType<typeof listPhoneLinkCandidates>> = [];
  try { candidates = (await listPhoneLinkCandidates(session.authUserId)).filter(candidate => candidate.state === "linkable"); } catch { /* 아래에서 /store로 */ }
  if (!candidates.length) redirect("/store");
  return <main className="mx-auto max-w-xl space-y-4 p-4"><meta name="referrer" content="no-referrer" />
    <StorePhoneLinkConfirm candidates={candidates.map(({ customerId, customerName, addressHint }) => ({ customerId, customerName, addressHint }))} />
  </main>;
}
