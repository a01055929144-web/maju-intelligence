import { NextRequest, NextResponse } from "next/server";
import { distributorGate } from "@/lib/distributor-gate";
import { supabaseRequest } from "@/lib/store";
import { geocodeAddress } from "@/lib/kakao-address-geocode";
import { runLimited } from "@/lib/run-limited";
import { chunk, IMPORT_CHUNK, MAX_IMPORT_COLUMNS, type ImportColumn, type ImportRow } from "@/domains/lead/distributor-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 500행 주소 좌표 변환(동시 8건) 시간
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;
const DEFAULT_FIELDS: ReadonlyArray<readonly [string, "text" | "date"]> = [["취급 품목", "text"], ["사용 ERP", "text"], ["다음 연락일", "date"]];

const actorOf = (scope: { customerSession?: { userId?: string | null; operationalDisplayName?: string | null; invitedEmployeeName?: string | null; name?: string | null } | null; adminSession?: { name?: string | null } | null }) => ({
  id: scope.customerSession?.userId || null,
  name: scope.customerSession?.operationalDisplayName || scope.customerSession?.invitedEmployeeName || scope.customerSession?.name || scope.adminSession?.name || null,
});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const valid = (r: Partial<ImportRow>): r is ImportRow => Boolean(r && typeof r.name === "string" && r.name.trim() && r.name.length <= 300 && typeof r.status === "string");

/** 화면이 저장 상자를 보일지 확인(스위치 꺼진 회사는 404 → 상자 숨김). ?list=1이면 되돌릴 수 있는 가져오기 목록(되돌리지 않은 것, 최근 20개)도 준다. */
export async function GET(request: NextRequest) {
  const g = await distributorGate(request, request.nextUrl.searchParams.get("companyId") || undefined); if ("error" in g) return g.error;
  if (request.nextUrl.searchParams.get("list") !== "1") return NextResponse.json({ enabled: true });
  try {
    const batches = await supabaseRequest<Array<{ id: string; file_name: string; sheet_name: string | null; row_count: number; created_at: string }>>(`lead_import_batches?select=id,file_name,sheet_name,row_count,created_at&company_id=eq.${g.companyId}&undone_at=is.null&order=created_at.desc&limit=20`);
    const counted = await Promise.all(batches.map(async (b) => {
      const items = await supabaseRequest<Array<{ lead_id: string }>>(`lead_import_batch_items?select=lead_id&company_id=eq.${g.companyId}&batch_id=eq.${b.id}&limit=100000`);
      return { id: b.id, fileName: b.file_name, sheetName: b.sheet_name, createdAt: b.created_at, saved: items.length };
    }));
    return NextResponse.json({ enabled: true, batches: counted }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "가져오기 이력을 불러오지 못했습니다." }, { status: 503 }); }
}

/** body: { companyId, fileName, sheetName, total, batchId?, rows } — batchId 없이 보내면 새 묶음을 만들고, 이어지는 호출은 같은 batchId로 500행씩. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { companyId?: string; fileName?: string; sheetName?: string; total?: number; batchId?: string; columns?: ImportColumn[]; rows?: Partial<ImportRow>[] } | null;
  const g = await distributorGate(request, body?.companyId); if ("error" in g) return g.error;
  const { scope, companyId } = g;
  const rows = body?.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_CHUNK || !rows.every(valid)) return NextResponse.json({ message: `행은 1~${IMPORT_CHUNK}개, 상호가 있어야 합니다.` }, { status: 400 });
  const fileName = str(body?.fileName, 240).trim(); if (!fileName) return NextResponse.json({ message: "파일 이름이 필요합니다." }, { status: 400 });
  const actor = actorOf(scope);
  try {
    let batchId = body?.batchId || "";
    if (batchId) {
      if (!UUID.test(batchId)) return NextResponse.json({ message: "묶음 번호가 올바르지 않습니다." }, { status: 400 });
      const [found] = await supabaseRequest<Array<{ id: string; undone_at: string | null }>>(`lead_import_batches?select=id,undone_at&id=eq.${batchId}&company_id=eq.${companyId}`);
      if (!found || found.undone_at) return NextResponse.json({ message: "이미 되돌린 가져오기입니다." }, { status: 409 });
    } else {
      const total = Number.isInteger(body?.total) && body!.total! >= rows.length && body!.total! <= 100000 ? body!.total! : rows.length;
      const [batch] = await supabaseRequest<Array<{ id: string }>>("lead_import_batches?select=id", { method: "POST", body: JSON.stringify({ company_id: companyId, file_name: fileName, sheet_name: str(body?.sheetName, 100) || null, row_count: total, created_by_user_id: actor.id, created_by_name: actor.name, result_summary: { targetType: "distributor" } }) });
      batchId = batch.id;
    }
    // 유통사 리드 칸 기본값(취급 품목·사용 ERP·다음 연락일; 등급은 리드의 등급 열). 없는 칸만 이 회사에 만든다(여러 번 불러도 한 번만).
    const fields: Array<{ key: string; label: string }> = await supabaseRequest<Array<{ key: string; label: string }>>(`company_lead_fields?select=key,label&company_id=eq.${companyId}&archived_at=is.null`);
    const norm = (label: string) => label.replace(/\s/g, "");
    for (const [label, fieldType] of DEFAULT_FIELDS) {
      if (fields.some((f) => norm(f.label) === norm(label))) continue;
      const key = `field_${crypto.randomUUID().replaceAll("-", "")}`;
      await supabaseRequest("company_lead_fields", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: companyId, key, label, field_type: fieldType, show_in_list: true, filterable: true, created_by_user_id: actor.id, created_by_name: actor.name }) });
      fields.push({ key, label });
    }
    const keyOf = (label: string) => fields.find((f) => norm(f.label) === norm(label))!.key;
    // 표준 칸에 안 맞던 칸(리드소스·최근접촉일 …)은 이 회사의 커스텀 칸으로 만들고(같은 이름이 있으면 재사용) 값을 custom_values에 넣는다.
    const wanted = (Array.isArray(body?.columns) ? body!.columns! : []).filter((c): c is ImportColumn => Boolean(c) && typeof c.label === "string" && c.label.trim().length > 0 && c.label.length <= 60 && (c.type === "text" || c.type === "date")).slice(0, MAX_IMPORT_COLUMNS);
    const extraKeys = new Map<string, { key: string; type: "text" | "date" }>();
    let fieldsCreated = 0;
    for (const column of wanted) {
      const label = column.label.trim();
      let field = fields.find((f) => norm(f.label) === norm(label));
      if (!field) {
        const key = `field_${crypto.randomUUID().replaceAll("-", "")}`;
        await supabaseRequest("company_lead_fields", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ company_id: companyId, key, label, field_type: column.type, show_in_list: false, filterable: false, created_by_user_id: actor.id, created_by_name: actor.name }) });
        field = { key, label }; fields.push(field); fieldsCreated += 1;
      }
      extraKeys.set(column.label, { key: field.key, type: column.type });
    }
    const extraValues = (r: ImportRow) => {
      const out: Record<string, string> = {};
      for (const [label, value] of Object.entries(r.extras ?? {})) {
        const target = extraKeys.get(label);
        if (!target || typeof value !== "string" || !value.trim()) continue;
        out[target.key] = target.type === "date" ? (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "") : str(value, 300);
      }
      return out;
    };
    const kItems = keyOf("취급 품목"), kErp = keyOf("사용 ERP"), kNext = keyOf("다음 연락일");
    // 같은 묶음을 다시 보내거나 이미 있는 유통사 번호는 건너뛴다(재시도 안전).
    const phones = Array.from(new Set(rows.map((r) => r.phone).filter((p): p is string => Boolean(p))));
    const existing: Array<{ phone: string }> = [];
    for (const part of chunk(phones, 100)) existing.push(...await supabaseRequest<Array<{ phone: string }>>(`business_permit_leads?select=phone&company_id=eq.${companyId}&target_type=eq.distributor&merged_into_lead_id=is.null&phone=in.(${part.map(enc).join(",")})`));
    const have = new Set(existing.map((e) => e.phone));
    const fresh = rows.filter((r) => !r.phone || !have.has(r.phone));
    // 주소 → 좌표(카카오). 못 찾아도 저장은 계속(지도에만 안 보임).
    const points = await runLimited(fresh, 8, (r) => (r.address ? geocodeAddress(r.address) : Promise.resolve(null)));
    const created = fresh.length ? await supabaseRequest<Array<{ id: string }>>("business_permit_leads?select=id", { method: "POST", body: JSON.stringify(fresh.map((r, i) => ({
      company_id: companyId, target_type: "distributor", source: "distributor_import", import_batch_id: batchId, lead_period: "recent", is_target_industry: true,
      business_name: str(r.name, 300).trim(), address: str(r.address, 300) || null, latitude: points[i]?.lat ?? null, longitude: points[i]?.lng ?? null, phone: r.phone || null, fax: r.fax || null, email: r.email || null, grade: str(r.grade, 40) || null, next_action: str(r.nextAction, 300) || null, last_contact_at: typeof r.lastContact === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.lastContact) ? `${r.lastContact}T00:00:00+09:00` : null, status: r.status,
      custom_values: { ...extraValues(r), [kItems]: str(r.items, 300), [kErp]: str(r.erp, 300), [kNext]: r.nextContact || "", ...(r.extraPhones?.length ? { extra_phones: r.extraPhones.slice(0, 5) } : {}), ...(r.owner ? { owner_note: str(r.owner, 100) } : {}) },
    }))) }) : [];
    if (created.length) await supabaseRequest("lead_import_batch_items", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(created.map((c) => ({ company_id: companyId, batch_id: batchId, lead_id: c.id, action: "created" }))) });
    return NextResponse.json({ batchId, created: created.length, skipped: rows.length - created.length, fieldsCreated });
  } catch { return NextResponse.json({ message: "저장하지 못했습니다. 이미 저장된 묶음은 '되돌리기'로 지울 수 있습니다." }, { status: 503 }); }
}

/** 되돌리기: DELETE ?companyId=&batchId= — 연락 기록이 하나라도 있는 리드가 있으면 거절(기록 보호). */
export async function DELETE(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId") || undefined, batchId = request.nextUrl.searchParams.get("batchId") || "";
  const g = await distributorGate(request, companyId); if ("error" in g) return g.error;
  if (!UUID.test(batchId)) return NextResponse.json({ message: "묶음 번호가 올바르지 않습니다." }, { status: 400 });
  const actor = actorOf(g.scope);
  try {
    const items = await supabaseRequest<Array<{ lead_id: string }>>(`lead_import_batch_items?select=lead_id&company_id=eq.${g.companyId}&batch_id=eq.${batchId}`);
    const ids = items.map((i) => i.lead_id);
    if (ids.length) {
      for (const part of chunk(ids, 100)) { // 주소 길이 제한을 피해 100개씩 확인
        const touched = await supabaseRequest<Array<{ lead_id: string }>>(`lead_actions?select=lead_id&company_id=eq.${g.companyId}&lead_id=in.(${part.join(",")})&limit=1`);
        if (touched.length) return NextResponse.json({ message: "연락 기록이 있는 리드가 있어 되돌릴 수 없습니다." }, { status: 409 });
      }
      await supabaseRequest(`lead_import_batch_items?company_id=eq.${g.companyId}&batch_id=eq.${batchId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await supabaseRequest(`business_permit_leads?company_id=eq.${g.companyId}&import_batch_id=eq.${batchId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
    await supabaseRequest(`lead_import_batches?id=eq.${batchId}&company_id=eq.${g.companyId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ undone_at: new Date().toISOString(), undone_by_user_id: actor.id, undone_by_name: actor.name }) });
    return NextResponse.json({ removed: ids.length });
  } catch { return NextResponse.json({ message: "되돌리지 못했습니다. 다시 시도해 주세요." }, { status: 503 }); }
}
