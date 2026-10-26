import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isLeadWorkspaceV2Enabled } from "@/lib/feature-modules";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const TYPES = new Set(["text", "number", "date", "select", "multi_select", "checkbox"]);

export async function GET(request: NextRequest) {
  const requestedCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const scope = await getRequestAuthScope(request, requestedCompanyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isLeadWorkspaceV2Enabled(scope.companyId)) return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404 });
  const rows = await supabaseRequest<Array<Record<string, unknown>>>(`company_lead_fields?select=*&company_id=eq.${encodeURIComponent(scope.companyId!)}&archived_at=is.null&order=sort_order,id`).catch(() => []);
  return NextResponse.json({ fields: rows.map(toField) });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; label?: string; fieldType?: string; showInList?: boolean; filterable?: boolean } | null;
  const scope = await getRequestAuthScope(request, body?.companyId); if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) return NextResponse.json({ message: "리드 칸을 관리할 권한이 없습니다." }, { status: 403 });
  if (!isLeadWorkspaceV2Enabled(scope.companyId)) return NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404 });
  const label = body?.label?.trim() || ""; if (!label || label.length > 60 || !TYPES.has(body?.fieldType || "")) return NextResponse.json({ message: "칸 이름과 형식을 확인해 주세요." }, { status: 400 });
  const key = `field_${crypto.randomUUID().replaceAll("-", "")}`;
  const actorUserId = scope.customerSession?.userId || null;
  const actorName = scope.customerSession?.operationalDisplayName
    || scope.customerSession?.invitedEmployeeName
    || scope.customerSession?.name
    || scope.adminSession?.name
    || null;
  try { const [row] = await supabaseRequest<Array<Record<string, unknown>>>("company_lead_fields?select=*", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ company_id: scope.companyId, key, label, field_type: body?.fieldType, show_in_list: Boolean(body?.showInList), filterable: Boolean(body?.filterable), created_by_user_id: actorUserId, created_by_name: actorName }) }); return NextResponse.json({ field: toField(row) }); }
  catch { return NextResponse.json({ message: "리드 칸 SQL 적용 후 사용할 수 있습니다." }, { status: 503 }); }
}

function toField(row: Record<string, unknown>) { return { id: String(row.id), key: String(row.key), label: String(row.label), fieldType: String(row.field_type), options: Array.isArray(row.options) ? row.options : [], showInList: Boolean(row.show_in_list), filterable: Boolean(row.filterable) }; }
