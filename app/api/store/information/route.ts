import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { getStoreInformation, getStoreProfileInformation, updateStoreInformation, updateStoreProfileInformation } from "@/lib/store/07-store-information";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scope = (request: NextRequest) => ({ companyId: request.nextUrl.searchParams.get("companyId") || "", storeAccountId: request.nextUrl.searchParams.get("storeAccountId") || "" });

export async function GET(request: NextRequest) {
  const ids = scope(request);
  if (!uuid.test(ids.companyId) || !uuid.test(ids.storeAccountId)) return NextResponse.json({ message: "매장 정보를 확인해 주세요." }, { status: 400, headers: noStore });
  try {
    const member = await getStoreMemberContext(ids);
    if (!member) return NextResponse.json({ message: "매장 로그인을 확인해 주세요." }, { status: 403, headers: noStore });
    const enabled = isFeatureEnabled("STORE_PROFILE_SETTINGS", ids.companyId);
    const information = enabled ? await getStoreProfileInformation(ids.companyId, ids.storeAccountId) : await getStoreInformation(ids.companyId, ids.storeAccountId);
    return information ? NextResponse.json({ ...information, canEdit: member.role === "owner", profileSettingsEnabled: enabled }, { headers: noStore }) :
      NextResponse.json({ message: "매장 정보를 찾지 못했습니다." }, { status: 404, headers: noStore });
  } catch { return NextResponse.json({ message: "매장 정보를 불러오지 못했습니다." }, { status: 503, headers: noStore }); }
}

export async function PATCH(request: NextRequest) {
  const ids = scope(request);
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "같은 매장 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  if (!uuid.test(ids.companyId) || !uuid.test(ids.storeAccountId)) return NextResponse.json({ message: "매장 정보를 확인해 주세요." }, { status: 400, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const storeName = typeof body?.storeName === "string" ? body.storeName.trim() : "";
  const representativeName = typeof body?.representativeName === "string" ? body.representativeName.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  if (!storeName || storeName.length > 100 || representativeName.length > 50 || (phone && !/^\d{9,11}$/.test(phone)))
    return NextResponse.json({ message: "상호·대표자·연락처를 확인해 주세요." }, { status: 400, headers: noStore });
  try {
    const member = await getStoreMemberContext(ids);
    if (!member || member.role !== "owner") return NextResponse.json({ message: "점주만 매장 정보를 수정할 수 있습니다." }, { status: 403, headers: noStore });
    if (isFeatureEnabled("STORE_PROFILE_SETTINGS", ids.companyId)) {
      const information = await getStoreProfileInformation(ids.companyId, ids.storeAccountId);
      if (!information) return NextResponse.json({ message: "매장 정보를 찾지 못했습니다." }, { status: 404, headers: noStore });
      const text = (key: string, max: number) => typeof body?.[key] === "string" ? String(body[key]).trim().slice(0, max) : "";
      const baseAddress = text("baseAddress", 300);
      if (!baseAddress) return NextResponse.json({ message: "매장 주소를 입력해 주세요.", code: "store_profile_address_required" }, { status: 400, headers: noStore });
      await updateStoreProfileInformation(information.storeProfileId, member.authUserId, { storeName, representativeName,
        baseAddress, addressDetail: text("addressDetail", 300), accessNote: text("accessNote", 500),
        deliveryContactPhone: text("deliveryContactPhone", 30), preferredDeliveryTime: text("preferredDeliveryTime", 100) }, randomUUID());
    } else await updateStoreInformation(ids.companyId, ids.storeAccountId, { storeName, representativeName, phone });
    return NextResponse.json({ saved: true }, { headers: noStore });
  } catch { return NextResponse.json({ message: "매장 정보를 저장하지 못했습니다." }, { status: 503, headers: noStore }); }
}
