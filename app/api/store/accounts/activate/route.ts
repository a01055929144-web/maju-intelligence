import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";

import { getStoreOwnerActivationProof, setPublicStoreOwnerKakaoProof, setStoreOwnerActivationProof, setStoreSession,
  storeMemberSessionEnabled } from "@/lib/auth";
import { activatePreopeningStoreOwner, activateStoreOwner, completePublicStoreOwnerProfile, getPreparedStoreOwnerActivation, preparePublicStoreOwnerActivation, STORE_TERMS_VERSION,
  publicPreopeningStoreEnabled, publicStoreOwnerOnboardingEnabled, verifyPublicStoreOwnerOnboardingIntent } from "@/lib/store/07-store-owner-provisioning";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";
import { checkBusinessRegistrationStatusesWithHealth } from "@/lib/business-status";
import { isPublicOwnerTestNumber, publicOwnerTestAccessAllowed, publicOwnerTestModeRequested, publicOwnerTestNumberForCompany } from "@/lib/store/public-owner-test-mode";
import { preparePublicOwnerTestOrdering } from "@/lib/pricing/public-owner-test-ordering";
import { PublicOwnerDeliveryUnavailable, resolvePublicOwnerDelivery } from "@/lib/pricing/public-owner-delivery";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!publicOwnerTestAccessAllowed()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  if (!storeMemberSessionEnabled()) return NextResponse.json({ message: "Not found" }, { status: 404 });
  let body: { termsAccepted?: boolean; token?: string; onboardingIntent?: string;
    store?: { address?: string; addressDetail?: string; businessRegistrationNumber?: string; phone?: string; representativeName?: string; storeName?: string } };
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
    const baseAddress = body.store.address?.trim() || "", addressDetail = body.store.addressDetail?.trim() || "";
    const profile = { address: `${baseAddress} ${addressDetail}`.trim(), businessRegistrationNumber: body.store.businessRegistrationNumber?.replace(/\D/g, "") || "",
      phone: body.store.phone?.replace(/\D/g, "") || "", representativeName: body.store.representativeName?.trim() || "", storeName: body.store.storeName?.trim() || "" };
    if ((profile.businessRegistrationNumber.length !== 10 && profile.businessRegistrationNumber.length !== 0) ||
      profile.phone.length < 9 || profile.phone.length > 11 || !profile.storeName || profile.storeName.length > 100 ||
      !profile.representativeName || profile.representativeName.length > 50 || !baseAddress || !addressDetail || addressDetail.length > 100 || profile.address.length > 300) {
      return NextResponse.json({ message: "Store profile required" }, { status: 400 });
    }
    let stage = "request";
    try {
      const proof = await getStoreOwnerActivationProof();
      if (!proof?.authUserId || proof.stage !== "profile" || !proof.returnTo) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      const activation = await getPreparedStoreOwnerActivation(proof.token);
      if (!activation || !activation.publicOnboarding || !publicStoreOwnerOnboardingEnabled(activation.companyId) ||
        !isStoreMemberCompanyAllowlisted(activation.companyId) || !publicOwnerTestAccessAllowed(activation.companyId)) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      if (!profile.businessRegistrationNumber && !publicOwnerTestModeRequested() && !publicPreopeningStoreEnabled(activation.companyId))
        return NextResponse.json({ code: "preopening_unavailable" }, { status: 422 });
      stage = "business_verification";
      if (!profile.businessRegistrationNumber) profile.businessRegistrationNumber = publicOwnerTestNumberForCompany(activation.companyId) || "";
      const testNumber = isPublicOwnerTestNumber(activation.companyId, profile.businessRegistrationNumber);
      if (publicOwnerTestModeRequested()) {
        if (!testNumber) return NextResponse.json({ message: "Business verification required" }, { status: 422 });
      } else if (profile.businessRegistrationNumber) {
        const { failedNumbers, results } = await checkBusinessRegistrationStatusesWithHealth([profile.businessRegistrationNumber]);
        if (failedNumbers.has(profile.businessRegistrationNumber) || results.get(profile.businessRegistrationNumber)?.label !== "정상")
          return NextResponse.json({ message: "Business verification required" }, { status: 422 });
      }
      stage = "delivery_resolution";
      const deliveryTerritoryId = testNumber ? undefined : await resolvePublicOwnerDelivery(activation.companyId, baseAddress);
      stage = "profile_save";
      await completePublicStoreOwnerProfile({ ...profile, token: proof.token });
      stage = "activation";
      const activated = profile.businessRegistrationNumber
        ? await activateStoreOwner({ authUserId: proof.authUserId, businessRegistrationNumber: profile.businessRegistrationNumber,
          termsAcceptedAt: new Date().toISOString(), token: proof.token,
          verificationRequestId: `${deliveryTerritoryId ? "public-delivery-v1:" : testNumber ? "test-only:" : ""}${randomUUID()}`,
          verifiedAt: new Date().toISOString(), ...(deliveryTerritoryId ? { deliveryTerritoryId } : {}) })
        : await activatePreopeningStoreOwner({ authUserId: proof.authUserId, deliveryTerritoryId,
          termsAcceptedAt: new Date().toISOString(), token: proof.token });
      if (testNumber) {
        stage = "test_ordering";
        await preparePublicOwnerTestOrdering(activation.companyId, activated.storeAccountId);
      }
      stage = "session";
      if (!(await setStoreSession(proof.authUserId))) return NextResponse.json({ message: "Activation unavailable" }, { status: 410 });
      await getStoreOwnerActivationProof({ consume: true });
      return NextResponse.json({ next: "document", redirectTo: proof.returnTo, termsVersion: STORE_TERMS_VERSION });
    } catch (error) {
      if (error instanceof PublicOwnerDeliveryUnavailable ||
        (error instanceof Error && /public_delivery_(territory|rules)_unavailable/.test(error.message)))
        return NextResponse.json({ code: "delivery_area_unavailable" }, { status: 422 });
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
