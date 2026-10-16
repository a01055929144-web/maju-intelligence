import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { listBusinessDocuments, listErpOptions, saveBusinessDocument, type SaveBusinessDocumentInput } from "@/lib/business-documents";

export const dynamic = "force-dynamic";
type Scope = Awaited<ReturnType<typeof getRequestAuthScope>>;
function denied(scope: Scope) {
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "전표를 관리할 권한이 없습니다." }, { status: 403 });
  return null;
}
function actor(scope: Scope) {
  return { userId: scope.ok ? scope.customerSession?.userId : undefined, name: scope.ok ? scope.customerSession?.name || scope.adminSession?.name || "운영자" : "운영자" };
}

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  const error = denied(scope); if (error) return error;
  try {
    if (request.nextUrl.searchParams.get("mode") === "options") return NextResponse.json(await listErpOptions(scope.companyId!));
    return NextResponse.json(await listBusinessDocuments(scope.companyId!, {
      cursor: request.nextUrl.searchParams.get("cursor") || undefined,
      dateFrom: request.nextUrl.searchParams.get("dateFrom") || undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") || undefined,
      type: request.nextUrl.searchParams.get("type") || undefined,
      status: request.nextUrl.searchParams.get("status") || undefined,
      partnerId: request.nextUrl.searchParams.get("partnerId") || undefined,
    }));
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "전표를 불러오지 못했습니다." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as (SaveBusinessDocumentInput & { companyId?: string }) | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  const error = denied(scope); if (error) return error;
  if (!body) return NextResponse.json({ message: "전표 정보를 확인해 주세요." }, { status: 400 });
  try { return NextResponse.json({ document: await saveBusinessDocument(scope.companyId!, body, actor(scope)) }); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "전표를 저장하지 못했습니다." }, { status: 400 }); }
}

