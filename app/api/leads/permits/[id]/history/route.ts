import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

type Row = { id: string; action_type: string; result: string | null; memo: string | null; actor_name: string | null; created_at: string; voided_at?: string | null; voided_by?: string | null; void_reason?: string | null };

/** 11/4: 수정 기록 — 이미 쌓이고 있는 리드 기록(정보 수정·단계 변경·컨택·취소)을 시간순으로 보여줍니다. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "리드를 찾을 수 없습니다." }, { status: 400 });
  const rows = await supabaseRequest<Row[]>(
    `lead_actions?select=id,action_type,result,memo,actor_name,created_at,voided_at,voided_by,void_reason&company_id=eq.${encodeURIComponent(scope.companyId)}&lead_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=100`
  ).catch(() => [] as Row[]);
  const items = rows.flatMap((row) => {
    const base = { actor: row.actor_name || "기록자 미상", detail: [row.result, row.memo].filter(Boolean).join(" · "), type: row.action_type };
    const list = [{ ...base, at: row.created_at, id: row.id, kind: "record" as const }];
    if (row.voided_at) list.unshift({ actor: row.voided_by || "기록자 미상", at: row.voided_at, detail: row.void_reason || "", id: `${row.id}-void`, kind: "void" as const, type: row.action_type });
    return list;
  });
  return NextResponse.json({ items });
}
