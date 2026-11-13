import { NextRequest, NextResponse } from "next/server";
import { supabaseRequest } from "../../../lib/store";
import { storeGradeGate } from "../../../lib/pricing/store-grade-gate";
import { parseGradeInput } from "../../../domains/pricing/store-grade";
export const dynamic = "force-dynamic";

// CC-32c: 매장 등급 목록·저장·보관·매장 지정. 스위치 STORE_GRADES(기본 OFF)를 켠 회사의 대표·관리자만, service_role 경유.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = { id: string; name: string; color: string; sort_order: number };

async function list(companyId: string) {
  const [grades, assigned] = await Promise.all([
    supabaseRequest<Row[]>(`company_store_grades?select=id,name,color,sort_order&company_id=eq.${companyId}&archived_at=is.null&order=sort_order,name`),
    // 한 회사 매장이 2만 곳을 넘으면 앞쪽만 센다(shortcut, 카탈로그 매장 수와 같은 한계).
    supabaseRequest<Array<{ id: string; store_grade_id: string }>>(`normalized_customers?select=id,store_grade_id&company_id=eq.${companyId}&store_grade_id=not.is.null&limit=20000`).catch(() => []),
  ]);
  const count = new Map<string, number>();
  for (const c of assigned) count.set(c.store_grade_id, (count.get(c.store_grade_id) ?? 0) + 1);
  return {
    grades: grades.map((g) => ({ id: g.id, name: g.name, color: g.color, sortOrder: g.sort_order, storeCount: count.get(g.id) ?? 0 })),
    assignments: Object.fromEntries(assigned.map((c) => [c.id, c.store_grade_id])),
  };
}

export async function GET(request: NextRequest) {
  const g = await storeGradeGate(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in g) return g.error;
  try { return NextResponse.json(await list(g.companyId), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ message: "매장 등급을 불러오지 못했습니다." }, { status: 500 }); }
}

/** body: { companyId, action: "save"|"archive"|"assign", id?, name, color, sortOrder | customerIds(≤100), gradeId(null=해제) } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; action?: string; id?: string; name?: unknown; color?: unknown; sortOrder?: unknown; customerIds?: unknown; gradeId?: string | null } | null;
  const g = await storeGradeGate(request, body?.companyId);
  if ("error" in g) return g.error;
  const { companyId } = g;
  try {
    if (body?.action === "save") {
      const input = parseGradeInput(body);
      if (!input || (body.id && !UUID.test(body.id))) return NextResponse.json({ message: "이름(40자 이하)·색을 확인해 주세요." }, { status: 400 });
      const row = { name: input.name, color: input.color, sort_order: input.sortOrder, updated_at: new Date().toISOString() };
      if (body.id) await supabaseRequest(`company_store_grades?id=eq.${body.id}&company_id=eq.${companyId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
      else await supabaseRequest("company_store_grades", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: companyId, ...row }) });
      return NextResponse.json(await list(companyId));
    }
    if (body?.action === "archive") {
      if (!body.id || !UUID.test(body.id)) return NextResponse.json({ message: "등급을 확인해 주세요." }, { status: 400 });
      const used = await supabaseRequest<Array<{ id: string }>>(`normalized_customers?select=id&company_id=eq.${companyId}&store_grade_id=eq.${body.id}&limit=1`);
      if (used.length) return NextResponse.json({ message: "이 등급을 쓰는 매장이 있어 보관할 수 없습니다. 매장의 등급을 먼저 바꿔 주세요." }, { status: 409 });
      await supabaseRequest(`company_store_grades?id=eq.${body.id}&company_id=eq.${companyId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      return NextResponse.json(await list(companyId));
    }
    if (body?.action === "assign") {
      const ids = Array.isArray(body.customerIds) ? body.customerIds : [];
      if (!ids.length || ids.length > 100 || ids.some((id) => typeof id !== "string" || !UUID.test(id)) || (body.gradeId != null && !UUID.test(body.gradeId))) return NextResponse.json({ message: "매장은 1~100곳, 등급은 목록에서 골라 주세요." }, { status: 400 });
      if (body.gradeId) {
        const ok = await supabaseRequest<Array<{ id: string }>>(`company_store_grades?select=id&id=eq.${body.gradeId}&company_id=eq.${companyId}&archived_at=is.null`);
        if (!ok.length) return NextResponse.json({ message: "보관했거나 없는 등급입니다." }, { status: 400 });
      }
      await supabaseRequest(`normalized_customers?company_id=eq.${companyId}&id=in.(${(ids as string[]).join(",")})`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ store_grade_id: body.gradeId ?? null }) });
      return NextResponse.json(await list(companyId));
    }
    return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (/duplicate|unique|23505/i.test(text)) return NextResponse.json({ message: "같은 이름의 등급이 이미 있습니다." }, { status: 409 });
    console.error("store grade request failed", error);
    return NextResponse.json({ message: "저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
