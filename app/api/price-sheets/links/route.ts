import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { linkSupplierProducts } from "@/lib/pricing/supplier-link-repository";
import type { SupplierLinkInput } from "@/domains/pricing/supplier-link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 11/4: 엑셀 원문을 기존 상품에 연결해 둡니다(매입처 상품 → 우리 상품, 확정 연결).
 * 다음에 같은 원문이 오면 이름·규격이 달라도 이 상품으로 붙습니다. 새 테이블 없이 supplier_products·supplier_product_matches 사용.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; fileName?: string; links?: SupplierLinkInput[] } | null;
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, body?.companyId);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const companyId = auth.companyId;
  const links = (Array.isArray(body?.links) ? body!.links : []).filter((link): link is SupplierLinkInput => /^[0-9a-f-]{36}$/i.test(link.productId) && Boolean(link.rawName?.trim()) && Number.isFinite(Number(link.cost))).slice(0, 500);
  if (!links.length) return NextResponse.json({ linked: 0, attempted: 0, retryable: false });
  try {
    const result = await linkSupplierProducts(companyId, links);
    return NextResponse.json({ ...result, retryable: false });
  } catch {
    return NextResponse.json({ linked: 0, attempted: links.length, retryable: true, message: "매입처 연결을 완료하지 못했습니다. 다시 열 정렬하면 완료된 연결은 유지하고 나머지를 안전하게 다시 확인합니다." }, { status: 503 });
  }
}
