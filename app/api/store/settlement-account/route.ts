import { NextRequest, NextResponse } from "next/server";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { getStoreSettlementAccount } from "@/lib/store/07-store-settlement-account";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || "";
  const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") || "";
  if (!UUID.test(companyId) || !UUID.test(storeAccountId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404, headers: noStore });
  try {
    const member = await getStoreMemberContext({ companyId, storeAccountId });
    if (!member) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404, headers: noStore });
    const account = await getStoreSettlementAccount({ companyId, storeAccountId }, member);
    return account ? NextResponse.json({ account }, { headers: noStore })
      : NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404, headers: noStore });
  } catch { return NextResponse.json({ message: "입금 계좌를 불러오지 못했습니다." }, { status: 503, headers: noStore }); }
}
