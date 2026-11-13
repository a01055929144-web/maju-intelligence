import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { createStoreAddressSelection, getStoreAddress, isStoreAddressCompanyEnabled, updateStoreAddress, verifyStoreAddressSelection } from "@/lib/store/07-store-address-management";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function access(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || "";
  const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") || "";
  if (!uuid.test(companyId) || !uuid.test(storeAccountId) || !isStoreAddressCompanyEnabled(companyId)) return null;
  const member = await getStoreMemberContext({ companyId, storeAccountId });
  return member && (member.role === "owner" || member.role === "manager") ? { companyId, storeAccountId, member } : null;
}

export async function GET(request: NextRequest) {
  try {
    const scoped = await access(request);
    if (!scoped) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (!query) {
      const address = await getStoreAddress(scoped);
      return address ? NextResponse.json(address, { headers: { "Cache-Control": "no-store" } }) :
        NextResponse.json({ message: "매장 정보를 찾지 못했습니다." }, { status: 404 });
    }
    if (query.length < 2) return NextResponse.json({ message: "주소 검색어를 2글자 이상 입력하세요.", results: [] }, { status: 400 });
    const key = process.env.KAKAO_REST_KEY;
    if (!key) return NextResponse.json({ message: "주소 검색이 아직 준비되지 않았습니다.", results: [] }, { status: 503 });
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=10`,
      { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ message: "주소 검색에 실패했습니다.", results: [] }, { status: 503 });
    const payload = await response.json() as { documents?: Array<{ address_name: string; road_address?: { address_name?: string } | null }> };
    return NextResponse.json({ results: (payload.documents || []).map(item => {
      const address = item.road_address?.address_name || item.address_name;
      return { address, selectionProof: createStoreAddressSelection({ address, companyId: scoped.companyId, storeAccountId: scoped.storeAccountId }) };
    }).filter(item => item.address && item.selectionProof) });
  } catch { return NextResponse.json({ message: "매장 주소를 불러오지 못했습니다." }, { status: 503 }); }
}

export async function PUT(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase())
      return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
    const scoped = await access(request);
    if (!scoped) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    const baseAddress = verifyStoreAddressSelection(String(body.selectionProof || ""), scoped);
    const addressDetail = String(body.addressDetail || "").trim();
    if (!baseAddress || !addressDetail || addressDetail.length > 100)
      return NextResponse.json({ message: "검색한 기본 주소와 상세 주소를 모두 확인해 주세요." }, { status: 400 });
    await updateStoreAddress({ companyId: scoped.companyId,
      storeAccountId: scoped.storeAccountId, baseAddress, addressDetail });
    return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "매장 주소를 저장하지 못했습니다." }, { status: 409 }); }
}
