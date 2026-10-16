import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { cancelBusinessDocument, confirmBusinessDocument, createReturnDraft } from "@/lib/business-documents";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({})) as { action?: "confirm" | "cancel" | "return"; reason?: string; companyId?: string };
  const scope = await getRequestAuthScope(request, body.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "전표를 처리할 권한이 없습니다." }, { status: 403 });
  const actor = { userId: scope.customerSession?.userId, name: scope.customerSession?.name || scope.adminSession?.name || "운영자" };
  try {
    const id = (await params).id;
    if (body.action === "confirm") return NextResponse.json({ document: await confirmBusinessDocument(scope.companyId!, id, actor) });
    if (body.action === "cancel") return NextResponse.json({ document: await cancelBusinessDocument(scope.companyId!, id, body.reason || "", actor) });
    if (body.action === "return") return NextResponse.json({ document: await createReturnDraft(scope.companyId!, id, actor) });
    return NextResponse.json({ message: "처리 유형을 확인해 주세요." }, { status: 400 });
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "전표를 처리하지 못했습니다." }, { status: 400 }); }
}

