import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";

import { getStoreOwnerActivationProof, setPublicStoreOwnerKakaoProof, setStoreOwnerActivationProof, setStoreSession,
  storeMemberSessionEnabled } from "@/lib/auth";
import { activateStoreOwner, completePublicStoreOwnerProfile, getPreparedStoreOwnerActivation, preparePublicStoreOwnerActivation, STORE_TERMS_VERSION,
  publicStoreOwnerOnboardingEnabled, verifyPublicStoreOwnerOnboardingIntent } from "@/lib/store/07-store-owner-provisioning";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";
import { checkBusinessRegistrationStatusesWithHealth } from "@/lib/business-status";
import { isPublicOwnerTestNumber, publicOwnerTestAccessAllowed, publicOwnerTestModeRequested, publicOwnerTestNumberForCompany } from "@/lib/store/public-owner-test-mode";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!publicOwnerTestAccessAllowed()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (!storeMemberSessionEnabled()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  let body: { termsAccepted?: boolean; token?: string; onboardingIntent?: string;
    store?: { address?: string; businessRegistrationNumber?: string; phone?: string; representativeName?: string; storeName?: string } };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid request" }, { status: 400 }); }
  if (body.onboardingIntent && !body.store) {
    const context = verifyPublicStoreOwnerOnboardingIntent(body.onboardingIntent);
    if (!context) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
    try {
      const token = randomBytes(32).toString("base64url");
      const prepared = await preparePublicStoreOwnerActivation({ ...context, idempotencyKey: context.nonce, token });
      if (!(await setPublicStoreOwnerKakaoProof(token, context.returnTo))) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      const query = new URLSearchParams({ activation: "1", companyId: context.companyId, store: "1", storeAccountId: prepared.storeAccountId });
      return NextResponse.json({ loginUrl: `/api/auth/kakao/start?${query}`, next: "kakao", termsVersion: STORE_TERMS_VERSION });
    } catch { return NextResponse.json({ message: "Store activation unavailable" }, { status: 503 }); }
  }
  if (body.termsAccepted === true && body.store && !body.onboardingIntent) {
    const profile = { address: body.store.address?.trim() || "", businessRegistrationNumber: body.store.businessRegistrationNumber?.replace(/\D/g, "") || "",
      phone: body.store.phone?.replace(/\D/g, "") || "", representativeName: body.store.representativeName?.trim() || "", storeName: body.store.storeName?.trim() || "" };
    if ((profile.businessRegistrationNumber.length !== 10 && !(publicOwnerTestModeRequested() && !profile.businessRegistrationNumber)) ||
      profile.phone.length < 9 || profile.phone.length > 11 || !profile.storeName || profile.storeName.length > 100 ||
      !profile.representativeName || profile.representativeName.length > 50 || !profile.address || profile.address.length > 300) {
      return NextResponse.json({ message: "Store profile required" }, { status: 400 });
    }
    let stage = "request";
    try {
      const proof = await getStoreOwnerActivationProof();
      if (!proof?.authUserId || proof.stage !== "profile" || !proof.returnTo) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      const activation = await getPreparedStoreOwnerActivation(proof.token);
      if (!activation || !activation.publicOnboarding || !publicStoreOwnerOnboardingEnabled(activation.companyId) ||
        !isStoreMemberCompanyAllowlisted(activation.companyId) || !publicOwnerTestAccessAllowed(activation.companyId)) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      stage = "business_verification";
      if (!profile.businessRegistrationNumber) profile.businessRegistrationNumber = publicOwnerTestNumberForCompany(activation.companyId) || "";
      const testNumber = isPublicOwnerTestNumber(activation.companyId, profile.businessRegistrationNumber);
      if (publicOwnerTestModeRequested()) {
        if (!testNumber) return NextResponse.json({ message: "Business verification required" }, { status: 422 });
      } else {
        const { failedNumbers, results } = await checkBusinessRegistrationStatusesWithHealth([profile.businessRegistrationNumber]);
        if (failedNumbers.has(profile.businessRegistrationNumber) || results.get(profile.businessRegistrationNumber)?.label !== "정상")
          return NextResponse.json({ message: "Business verification required" }, { status: 422 });
      }
      stage = "profile_save";
      await completePublicStoreOwnerProfile({ ...profile, token: proof.token });
      stage = "activation";
      await activateStoreOwner({ authUserId: proof.authUserId, businessRegistrationNumber: profile.businessRegistrationNumber,
        termsAcceptedAt: new Date().toISOString(), token: proof.token, verificationRequestId: `${testNumber ? "test-only:" : ""}${randomUUID()}`, verifiedAt: new Date().toISOString() });
      stage = "session";
      if (!(await setStoreSession(proof.authUserId))) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      await getStoreOwnerActivationProof({ consume: true });
      return NextResponse.json({ next: "document", redirectTo: proof.returnTo, termsVersion: STORE_TERMS_VERSION });
    } catch (error) {
      if (error instanceof Error && error.message.includes("public_store_retry_mismatch"))
        return NextResponse.json({ code: "profile_retry_mismatch" }, { status: 409 });
      console.error("public_store_owner_activation_failed", { stage });
      return NextResponse.json({ message: "Store activation unavailable" }, { status: 503 });
    }
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
