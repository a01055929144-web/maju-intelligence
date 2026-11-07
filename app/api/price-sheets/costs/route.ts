import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { updatePurchaseCosts, type PurchaseCostChange } from "@/application/pricing/update-purchase-cost";
import { purchaseCostRepository } from "@/lib/pricing/purchase-cost-repository";
import { latestPurchaseCostBatch, purchaseCostBatchEnabled, purchaseCostBatchError, restorePurchaseCostBatch, savePurchaseCostBatch, validPurchaseCostBatchValue, type PurchaseCostBatchChange } from "@/lib/pricing/purchase-cost-batch";

export const dynamic = "force-dynamic";
const costs = updatePurchaseCosts(purchaseCostRepository);

async function scope(request: NextRequest, companyId?: string) {
  if (!priceSheetsEnabled()) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!auth.companyId || !isFeatureEnabled("PRICING", auth.companyId)) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return { error: NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 }) };
  return { auth };
}

export async function GET(request: NextRequest) {
  const checked = await scope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (checked.error) return checked.error;
  try {
    const companyId = checked.auth!.companyId!;
    const result = await costs.list(companyId);
    if (!purchaseCostBatchEnabled(companyId)) return NextResponse.json({ ...(result as object), batchEnabled: false }, { headers: { "Cache-Control": "no-store" } });
    const latestBatch = await latestPurchaseCostBatch(companyId);
    return NextResponse.json({ ...(result as object), batchEnabled: true, latestBatch }, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return NextResponse.json({ message: purchaseCostBatchEnabled(checked.auth!.companyId!) ? "원자적 저장 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." : error instanceof Error ? error.message : "매입가를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      const parsed = new URL(origin);
      sameOrigin = ["http:", "https:"].includes(parsed.protocol) &&
        parsed.host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase();
    } catch { /* malformed origins are rejected */ }
    if (!sameOrigin) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { companyId?: string; action?: "save-batch" | "restore-batch"; batchId?: string; changes?: PurchaseCostBatchChange[] } | null;
  const checked = await scope(request, body?.companyId);
  if (checked.error) return checked.error;
  try {
    const companyId = checked.auth!.companyId!;
    const actorName = checked.auth!.customerSession?.name || checked.auth!.adminSession?.name || "운영자";
    if (body?.action) {
      if (!purchaseCostBatchEnabled(companyId)) return NextResponse.json({ message: "원자적 저장 기능을 사용할 수 없습니다." }, { status: 404 });
      if (!body.batchId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.batchId)) return NextResponse.json({ message: "저장 요청 번호를 확인해 주세요." }, { status: 400 });
      if (body.action === "restore-batch") return NextResponse.json(await restorePurchaseCostBatch(companyId, body.batchId, actorName));
      if (body.action === "save-batch") {
        const changes = body.changes;
        if (!Array.isArray(changes) || !changes.length || changes.length > 100 || changes.some((change) =>
          !change || typeof change !== "object" || ![change.cost, change.expectedCost].every(validPurchaseCostBatchValue)
          || (change.supplierProductId && !(change.expectedSupplierCost === null || typeof change.expectedSupplierCost === "number" && Number.isFinite(change.expectedSupplierCost))))) {
          return NextResponse.json({ message: "매입가 변경 항목을 확인해 주세요." }, { status: 400 });
        }
        return NextResponse.json(await savePurchaseCostBatch(companyId, body.batchId, actorName, changes));
      }
      return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
    }
    if (purchaseCostBatchEnabled(companyId)) return NextResponse.json({ message: "원자적 저장 방식으로 화면을 새로고침한 뒤 다시 시도해 주세요." }, { status: 409 });
    return NextResponse.json(await costs.save(companyId, actorName, body?.changes as PurchaseCostChange[] || []));
  } catch (error) {
    return NextResponse.json({ message: body?.action ? purchaseCostBatchError(error) : error instanceof Error ? error.message : "매입가를 저장하지 못했습니다." }, { status: 409 });
  }
}
