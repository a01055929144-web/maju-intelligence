import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getBusinessDocument, saveBusinessDocument, type SaveBusinessDocumentInput } from "@/lib/business-documents";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getRequestAuthScope(request); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "전표를 조회할 권한이 없습니다." }, { status: 403 });
  try { return NextResponse.json({ document: await getBusinessDocument(scope.companyId!, (await params).id) }); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "전표를 찾지 못했습니다." }, { status: 404 }); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as (SaveBusinessDocumentInput & { companyId?: string }) | null;
  const scope = await getRequestAuthScope(request, body?.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "전표를 수정할 권한이 없습니다." }, { status: 403 });
  if (!body) return NextResponse.json({ message: "전표 정보를 확인해 주세요." }, { status: 400 });
  try { return NextResponse.json({ document: await saveBusinessDocument(scope.companyId!, { ...body, id: (await params).id }, { userId: scope.customerSession?.userId, name: scope.customerSession?.name || scope.adminSession?.name || "운영자" }) }); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "전표를 수정하지 못했습니다." }, { status: 400 }); }
}

