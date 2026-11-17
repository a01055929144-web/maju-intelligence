import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { getStoreProfileAttachments, getStoreProfileInformation, StoreProfileAttachmentKind, uploadStoreProfileAttachment } from "@/lib/store/07-store-information";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set<StoreProfileAttachmentKind>(["cold", "frozen", "room"]);
const scope = (request: NextRequest) => ({ companyId: request.nextUrl.searchParams.get("companyId") || "", storeAccountId: request.nextUrl.searchParams.get("storeAccountId") || "" });

export async function GET(request: NextRequest) {
  const ids = scope(request);
  if (!uuid.test(ids.companyId) || !uuid.test(ids.storeAccountId) || !isFeatureEnabled("STORE_PROFILE_DELIVERY", ids.companyId))
    return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404, headers: noStore });
  const member = await getStoreMemberContext(ids).catch(() => null);
  if (!member) return NextResponse.json({ message: "매장 로그인을 확인해 주세요." }, { status: 403, headers: noStore });
  const profile = await getStoreProfileInformation(ids.companyId, ids.storeAccountId).catch(() => null);
  if (!profile) return NextResponse.json({ message: "매장 정보를 찾지 못했습니다." }, { status: 404, headers: noStore });
  try { return NextResponse.json({ attachments: await getStoreProfileAttachments(profile.storeProfileId) }, { headers: noStore }); }
  catch { return NextResponse.json({ message: "보관 사진을 불러오지 못했습니다." }, { status: 503, headers: noStore }); }
}

export async function POST(request: NextRequest) {
  const ids = scope(request);
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "같은 매장 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  if (!uuid.test(ids.companyId) || !uuid.test(ids.storeAccountId) || !isFeatureEnabled("STORE_PROFILE_DELIVERY", ids.companyId))
    return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404, headers: noStore });
  const member = await getStoreMemberContext(ids).catch(() => null);
  if (!member || member.role !== "owner") return NextResponse.json({ message: "점주만 보관 사진을 수정할 수 있습니다." }, { status: 403, headers: noStore });
  const data = await request.formData().catch(() => null), file = data?.get("file"), kind = String(data?.get("kind") || "") as StoreProfileAttachmentKind;
  if (!(file instanceof File) || !kinds.has(kind) || !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)
    return NextResponse.json({ message: "10MB 이하 이미지 파일을 선택해 주세요." }, { status: 400, headers: noStore });
  const profile = await getStoreProfileInformation(ids.companyId, ids.storeAccountId).catch(() => null);
  if (!profile) return NextResponse.json({ message: "매장 정보를 찾지 못했습니다." }, { status: 404, headers: noStore });
  try { return NextResponse.json({ attachment: await uploadStoreProfileAttachment(profile.storeProfileId, kind, file) }, { headers: noStore }); }
  catch { return NextResponse.json({ message: "보관 사진을 저장하지 못했습니다." }, { status: 503, headers: noStore }); }
}
