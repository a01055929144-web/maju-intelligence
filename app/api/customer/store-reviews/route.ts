import { NextRequest, NextResponse } from "next/server";

import { customerHasCapability, getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { confirmNewCustomer, linkExistingCustomer, reviewCandidates, StoreReviewError } from "@/lib/pricing/store-customer-review";
import { storeCustomerReviewEnabled } from "@/lib/store/07-store-customer-review-feature";
import { listStoreCustomerReviews } from "@/lib/store/07-store-customer-review";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize() {
  const session = await getCustomerSession();
  if (!session?.userId) return { response: NextResponse.json({ message: "로그인을 확인해 주세요." }, { status: 401, headers: noStore }), session: null };
  if (!storeCustomerReviewEnabled(session.companyId))
    return { response: NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404, headers: noStore }), session: null };
  if (!customerHasCapability(session, "manage_members"))
    return { response: NextResponse.json({ message: "새 매장을 확인할 권한이 없습니다." }, { status: 403, headers: noStore }), session: null };
  return { response: null, session };
}

export async function GET() {
  const { response, session } = await authorize();
  if (response || !session) return response;
  try {
    return NextResponse.json({ items: await listStoreCustomerReviews(session.companyId) }, { headers: noStore });
  } catch {
    return NextResponse.json({ message: "새 매장을 불러오지 못했습니다." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const { response, session } = await authorize();
  if (response || !session) return response;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => null) as { action?: string; storeAccountId?: string; customerId?: string } | null;
  if (!body?.action || !body.storeAccountId || !UUID.test(body.storeAccountId))
    return NextResponse.json({ message: "매장을 다시 선택해 주세요." }, { status: 400, headers: noStore });
  const actor = { userId: session.userId, name: getCustomerOperationalName(session) || session.name || "고객사 담당자" };
  try {
    if (body.action === "candidates")
      return NextResponse.json({ candidates: await reviewCandidates(session.companyId, body.storeAccountId) }, { headers: noStore });
    if (body.action === "confirm_new")
      return NextResponse.json(await confirmNewCustomer(session.companyId, body.storeAccountId, actor), { headers: noStore });
    if (body.action !== "link_existing" || !body.customerId || !UUID.test(body.customerId))
      return NextResponse.json({ message: "연결할 거래처를 다시 선택해 주세요." }, { status: 400, headers: noStore });
    return NextResponse.json(await linkExistingCustomer(session.companyId, body.storeAccountId, body.customerId, actor), { headers: noStore });
  } catch (error) {
    if (error instanceof StoreReviewError)
      return NextResponse.json({ message: error.message }, { status: error.status, headers: noStore });
    return NextResponse.json({ message: "새 매장 확인을 처리하지 못했습니다." }, { status: 503, headers: noStore });
  }
}
