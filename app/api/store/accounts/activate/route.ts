import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { setStoreOwnerActivationProof, storeMemberSessionEnabled } from "@/lib/auth";
import { getPreparedStoreOwnerActivation, preparePublicStoreOwnerActivation, STORE_TERMS_VERSION,
  verifyPublicStoreOwnerOnboardingIntent } from "@/lib/store/07-store-owner-provisioning";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!storeMemberSessionEnabled()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  let body: { termsAccepted?: boolean; token?: string; onboardingIntent?: string;
    store?: { address?: string; businessRegistrationNumber?: string; phone?: string; representativeName?: string; storeName?: string } };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request" }, { status: 400 }); }
  if (body.termsAccepted === true && body.onboardingIntent && body.store) {
    const context = verifyPublicStoreOwnerOnboardingIntent(body.onboardingIntent);
    const profile = { address: body.store.address?.trim() || "", businessRegistrationNumber: body.store.businessRegistrationNumber?.replace(/\D/g, "") || "",
      phone: body.store.phone?.replace(/\D/g, "") || "", representativeName: body.store.representativeName?.trim() || "", storeName: body.store.storeName?.trim() || "" };
    if (!context || profile.businessRegistrationNumber.length !== 10 ||
      profile.phone.length < 9 || profile.phone.length > 11 || !profile.storeName || profile.storeName.length > 100 ||
      !profile.representativeName || profile.representativeName.length > 50 || !profile.address || profile.address.length > 300) {
      return NextResponse.json({ message: "Store profile required" }, { status: 400 });
    }
    try {
      const token = randomBytes(32).toString("base64url");
      const prepared = await preparePublicStoreOwnerActivation({ ...context, ...profile, idempotencyKey: context.nonce, token });
      if (!(await setStoreOwnerActivationProof(token, context.returnTo))) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      const query = new URLSearchParams({ activation: "1", companyId: context.companyId, store: "1", storeAccountId: prepared.storeAccountId });
      return NextResponse.json({ loginUrl: `/api/auth/kakao/start?${query}`, next: "kakao", returnTo: context.returnTo,
        termsVersion: STORE_TERMS_VERSION });
    } catch { return NextResponse.json({ message: "Store activation unavailable" }, { status: 503 }); }
  }
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
