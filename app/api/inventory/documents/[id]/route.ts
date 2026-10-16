import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getDocumentInventoryStatus, reapplyDocumentInventory } from "@/lib/inventory";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  return NextResponse.json({ status: await getDocumentInventoryStatus(scope.companyId!, (await params).id) });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as { companyId?: string };
  const scope = await getRequestAuthScope(request, body.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  try { return NextResponse.json({ status: await reapplyDocumentInventory(scope.companyId!, (await params).id, scope.customerSession?.name || scope.adminSession?.name || "운영자") }); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "재고를 재반영하지 못했습니다." }, { status: 400 }); }
}
