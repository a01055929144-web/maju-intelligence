import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getPartnerLedger, listPartnerPaymentDocuments, recordPartnerPayment, reversePartnerPayment } from "@/lib/business-documents";
import { isFeatureEnabled } from "@/lib/feature-flags";
export const dynamic = "force-dynamic";
function allowed(scope: Awaited<ReturnType<typeof getRequestAuthScope>>) { return scope.ok && scopeHasCapability(scope, "manage_sales"); }
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!allowed(scope)) return NextResponse.json({ message: "원장을 조회할 권한이 없습니다." }, { status: 403 });
  const s = request.nextUrl.searchParams; const partnerType = s.get("partnerType") as "customer" | "supplier";
  if (!s.get("partnerId") || !["customer", "supplier"].includes(partnerType)) return NextResponse.json({ message: "거래처를 선택해 주세요." }, { status: 400 });
  try {
    const paymentEnabled = isFeatureEnabled("PARTNER_PAYMENTS", scope.companyId);
    const [ledger, documents] = await Promise.all([
      getPartnerLedger(scope.companyId!, { partnerType, partnerId: s.get("partnerId")!, dateFrom: s.get("dateFrom") || "2000-01-01", dateTo: s.get("dateTo") || "2099-12-31" }),
      paymentEnabled ? listPartnerPaymentDocuments(scope.companyId!, partnerType, s.get("partnerId")!) : Promise.resolve([]),
    ]);
    return NextResponse.json({ ...ledger, documents, paymentEnabled });
  }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "원장을 불러오지 못했습니다." }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { action?: "record" | "reverse"; companyId?: string; partnerType: "customer" | "supplier"; partnerId: string; entryDate: string; amount: number; paymentMethod: "cash" | "bank" | "card"; documentId?: string; entryId?: string; memo?: string; reason?: string; idempotencyKey: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!allowed(scope)) return NextResponse.json({ message: "입금·지급을 등록할 권한이 없습니다." }, { status: 403 });
  if (!isFeatureEnabled("PARTNER_PAYMENTS", scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!body || !body.idempotencyKey?.trim()) return NextResponse.json({ message: "입금·지급 정보와 재시도 키를 확인해 주세요." }, { status: 400 });
  const actor = { userId: scope.customerSession?.userId, name: scope.customerSession?.name || scope.adminSession?.name || "운영자" };
  try {
    if (body.action === "reverse") return NextResponse.json({ entry: await reversePartnerPayment(scope.companyId!, body.entryId || "", body.reason || "", body.idempotencyKey, actor) });
    return NextResponse.json({ entry: await recordPartnerPayment(scope.companyId!, body, actor) });
  }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "입금·지급을 등록하지 못했습니다." }, { status: 400 }); }
}
