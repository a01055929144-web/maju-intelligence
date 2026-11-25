import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { searchStoreAddresses, verifyStoreAddressSelection, getStoreAddress } from "@/lib/store/07-store-address-management";
import { DeliveryInfoError, saveStoreDeliveryInfo } from "@/lib/store/07-store-delivery-info";
import { readCustomerDeliveryInfo } from "@/lib/pricing/store-delivery-info-read";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// CX-152: 매장 배송 정보(주소 + 받는 방법 등)를 한 시트·한 경로로 읽고 저장한다. 점주·관리자 구성원만. 비밀번호 값은 어디에도 돌려주지 않는다.
// 주소·상세 주소 필수 안내는 프로필 설정 플래그가 꺼져 있어도 동작한다(그때는 주소·상세 주소만 받는다).
async function access(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || "", storeAccountId = request.nextUrl.searchParams.get("storeAccountId") || "";
  if (!uuid.test(companyId) || !uuid.test(storeAccountId)) return null;
  const member = await getStoreMemberContext({ companyId, storeAccountId });
  return member && (member.role === "owner" || member.role === "manager") ? { companyId, storeAccountId, member } : null;
}

export async function GET(request: NextRequest) {
  try {
    const scoped = await access(request);
    if (!scoped) return NextResponse.json({ message: "점주·관리자 로그인이 필요합니다." }, { status: 403, headers: noStore });
    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (query) {
      const found = await searchStoreAddresses(query, scoped);
      return NextResponse.json(found.status === 200 ? { results: found.results } : { message: found.message, results: [] }, { status: found.status, headers: noStore });
    }
    const stores = await supabaseRequest<Array<{ customer_id: string }>>(
      `store_accounts?select=customer_id&company_id=eq.${encodeURIComponent(scoped.companyId)}&id=eq.${encodeURIComponent(scoped.storeAccountId)}&status=eq.active&limit=1`);
    if (!stores[0]) return NextResponse.json({ message: "매장 정보를 찾지 못했습니다." }, { status: 404, headers: noStore });
    const info = await readCustomerDeliveryInfo(scoped.companyId, stores[0].customer_id);
    const address = await getStoreAddress(scoped);
    return NextResponse.json({ ...info, currentAddress: address?.address ?? null }, { headers: noStore });
  } catch { return NextResponse.json({ message: "배송 정보를 불러오지 못했습니다." }, { status: 503, headers: noStore }); }
}

export async function PUT(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase())
      return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
    const scoped = await access(request);
    if (!scoped) return NextResponse.json({ message: "점주·관리자 로그인이 필요합니다." }, { status: 403, headers: noStore });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const text = (key: string, max: number) => typeof body?.[key] === "string" ? String(body[key]).slice(0, max) : "";
    // 주소를 새로 고르면 서명된 선택 증명이 필요하고, 안 바꾸면 이미 저장된 기본 주소를 그대로 쓴다.
    const proof = text("selectionProof", 1200);
    const baseAddress = proof ? verifyStoreAddressSelection(proof, scoped) : (await getStoreAddress(scoped))?.baseAddress?.trim() || null;
    if (!baseAddress) return NextResponse.json({ message: "주소를 검색해서 다시 골라 주세요." }, { status: 400, headers: noStore });
    await saveStoreDeliveryInfo(scoped, scoped.member.authUserId, { baseAddress, addressDetail: text("addressDetail", 300), accessNote: text("accessNote", 500),
      deliveryContactPhone: text("deliveryContactPhone", 30), receiveMethod: text("receiveMethod", 10), accessPassword: text("accessPassword", 101), accessControlled: body?.accessControlled === true });
    return NextResponse.json({ saved: true }, { headers: noStore });
  } catch (error) {
    if (error instanceof DeliveryInfoError) return NextResponse.json({ message: error.message }, { status: 400, headers: noStore });
    return NextResponse.json({ message: "배송 정보를 저장하지 못했습니다." }, { status: 503, headers: noStore });
  }
}
