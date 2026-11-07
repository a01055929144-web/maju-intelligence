import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { MAX_PURCHASE_DATE_BODY_BYTES, validDate, validId, validPurchaseDateRows } from "../../../../../domains/pricing/purchase-cost-date";
import { getPurchaseDateBatch, purchaseDateEnabled, purchaseDateError, restorePurchaseDateBatch, savePurchaseDateBatch, undatedPurchasePrices } from "../../../../../lib/pricing/purchase-cost-date";
export const dynamic = "force-dynamic";
async function scope(request: NextRequest, companyId?: string) {
  // OFF before session inspection, schema reads, or any RPC.
  if (!companyId || !priceSheetsEnabled() || !purchaseDateEnabled(companyId)) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  const auth = await getRequestAuthScope(request, companyId);
  if (!auth.ok || auth.companyId !== companyId) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!isFeatureEnabled("PRICING", companyId)) return { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return { error: NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 }) };
  return { auth };
}
export async function GET(request: NextRequest) {
  const checked = await scope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (checked.error) return checked.error;
  try {
    const batchId = request.nextUrl.searchParams.get("batchId");
    if (batchId) {
      if (!validId(batchId)) return NextResponse.json({ message: "저장 요청 번호를 확인해 주세요." }, { status: 400 });
      return NextResponse.json({ enabled: true, batch: await getPurchaseDateBatch(checked.auth!.companyId!, batchId) }, { headers: { "Cache-Control": "no-store" } });
    }
    const [latestBatch, undatedPrices] = await Promise.all([getPurchaseDateBatch(checked.auth!.companyId!), undatedPurchasePrices(checked.auth!.companyId!)]);
    return NextResponse.json({ enabled: true, maxRows: 5000, latestBatch, undatedPrices }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "날짜별 저장 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.host.toLowerCase() !== (request.headers.get("host") || request.nextUrl.host).toLowerCase()) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 }); }
    catch { return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 403 }); }
  }
  if (Number(request.headers.get("content-length")) > MAX_PURCHASE_DATE_BODY_BYTES) return NextResponse.json({ message: "파일의 저장 요청이 너무 큽니다. 원본을 보관하고 담당자에게 문의해 주세요." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_PURCHASE_DATE_BODY_BYTES) { await reader.cancel(); return NextResponse.json({ message: "파일의 저장 요청이 너무 큽니다. 원본을 보관하고 담당자에게 문의해 주세요." }, { status: 413 }); }
      chunks.push(part.value);
    }
  } catch { return NextResponse.json({ message: "요청을 읽지 못했습니다. 다시 시도해 주세요." }, { status: 400 }); }
  const raw = new Uint8Array(bytes); let offset = 0;
  chunks.forEach(chunk => { raw.set(chunk, offset); offset += chunk.length; });
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const checked = await scope(request, typeof input.companyId === "string" ? input.companyId : undefined);
  if (checked.error) return checked.error;
  if (!validId(input.batchId)) return NextResponse.json({ message: "저장 요청 번호를 확인해 주세요." }, { status: 400 });
  const companyId = checked.auth!.companyId!;
  const actor = (checked.auth!.customerSession?.name || checked.auth!.adminSession?.name || "운영자").slice(0, 100);
  try {
    if (input.action === "restore") return NextResponse.json(await restorePurchaseDateBatch(companyId, input.batchId, actor));
    if (input.action !== "save" || !validDate(input.receiptDate) || typeof input.fileName !== "string" || !input.fileName.trim() || input.fileName.length > 255 || !validPurchaseDateRows(input.rows))
      return NextResponse.json({ message: "원본 거래행과 상품·단가 선택을 확인해 주세요. 최대 5,000행까지 저장할 수 있습니다." }, { status: 400 });
    // The SQL RPC owns recalculation and rollback. Never issue a second pricing command here.
    const result = await savePurchaseDateBatch(companyId, input.batchId, input.receiptDate, input.fileName, actor, input.rows);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ message: purchaseDateError(error) }, { status: 409 }); }
}
