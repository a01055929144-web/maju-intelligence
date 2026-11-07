import { NextRequest, NextResponse } from "next/server";

import { setStoreOwnerActivationProof, storeMemberSessionEnabled } from "@/lib/auth";
import { getPreparedStoreOwnerActivation, STORE_TERMS_VERSION } from "@/lib/store/07-store-owner-provisioning";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!storeMemberSessionEnabled()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  let body: { termsAccepted?: boolean; token?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request" }, { status: 400 }); }
  if (body.termsAccepted !== true || !body.token || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) {
    return NextResponse.json({ message: "Terms acceptance required" }, { status: 400 });
  }
  try {
    const activation = await getPreparedStoreOwnerActivation(body.token);
    if (!activation || !isStoreMemberCompanyAllowlisted(activation.companyId) || !(await setStoreOwnerActivationProof(body.token))) {
      return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
    }
    const query = new URLSearchParams({ activation: "1", companyId: activation.companyId,
      store: "1", storeAccountId: activation.storeAccountId });
    return NextResponse.json({ loginUrl: `/api/auth/kakao/start?${query}`, termsVersion: STORE_TERMS_VERSION });
  } catch {
    return NextResponse.json({ message: "Store activation unavailable" }, { status: 503 });
  }
}
