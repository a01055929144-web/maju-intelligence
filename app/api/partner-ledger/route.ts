import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getPartnerLedger, recordPartnerPayment } from "@/lib/business-documents";
export const dynamic = "force-dynamic";
function allowed(scope: Awaited<ReturnType<typeof getRequestAuthScope>>) { return scope.ok && scopeHasCapability(scope, "manage_sales"); }
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!allowed(scope)) return NextResponse.json({ message: "원장을 조회할 권한이 없습니다." }, { status: 403 });
  const s = request.nextUrl.searchParams; const partnerType = s.get("partnerType") as "customer" | "supplier";
  if (!s.get("partnerId") || !["customer", "supplier"].includes(partnerType)) return NextResponse.json({ message: "거래처를 선택해 주세요." }, { status: 400 });
  try { return NextResponse.json(await getPartnerLedger(scope.companyId!, { partnerType, partnerId: s.get("partnerId")!, dateFrom: s.get("dateFrom") || "2000-01-01", dateTo: s.get("dateTo") || "2099-12-31" })); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "원장을 불러오지 못했습니다." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; partnerType: "customer" | "supplier"; partnerId: string; entryDate: string; amount: number; paymentMethod: "cash" | "bank" | "card"; memo?: string; idempotencyKey?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!allowed(scope)) return NextResponse.json({ message: "입금·지급을 등록할 권한이 없습니다." }, { status: 403 });
  if (!body) return NextResponse.json({ message: "입금·지급 정보를 확인해 주세요." }, { status: 400 });
  try { return NextResponse.json({ entry: await recordPartnerPayment(scope.companyId!, body, { userId: scope.customerSession?.userId, name: scope.customerSession?.name || scope.adminSession?.name || "운영자" }) }); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "입금·지급을 등록하지 못했습니다." }, { status: 400 }); }
}
