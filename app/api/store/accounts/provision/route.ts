import { NextRequest, NextResponse } from "next/server";

import { prepareStoreOwnerActivationForCustomer } from "@/application/organization/prepare-store-owner-activation";
import { getCustomerSession, storeMemberSessionEnabled } from "@/lib/auth";
import { getStorePublicBaseUrl } from "@/lib/store/07-store-owner-provisioning";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!storeMemberSessionEnabled()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isStoreMemberCompanyAllowlisted(session.companyId)) return NextResponse.json({ message: "Not found" }, { status: 404 });
  let body: { customerId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request" }, { status: 400 }); }
  try {
    const origin = getStorePublicBaseUrl();
    if (!origin) return NextResponse.json({ message: "Store activation unavailable" }, { status: 503 });
    const prepared = await prepareStoreOwnerActivationForCustomer(session, body.customerId || "");
    if (!prepared) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    const scope = `companyId=${encodeURIComponent(session.companyId)}&storeAccountId=${encodeURIComponent(prepared.storeAccountId)}`;
    return NextResponse.json({ activationUrl: `${origin}/store/activate#${prepared.token}`, expiresAt: prepared.expiresAt,
      loginUrl: `${origin}/api/auth/kakao/start?store=1&${scope}`, storeAccountId: prepared.storeAccountId,
      storeUrl: `${origin}/store?${scope}` });
  } catch {
    return NextResponse.json({ message: "Store activation unavailable" }, { status: 503 });
  }
}
