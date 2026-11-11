"use client";
import { useEffect, useMemo, useState } from "react";
import { chunk, groupDuplicates, parseImportRows } from "@/domains/lead/distributor-import";

// CC-21: 유통사로 저장. 중복 의심 묶음은 대표가 고르고(기본: 묶음의 첫 줄만 저장), 500행씩 저장, 저장 뒤 되돌리기.
export function DistributorImportSave({ companyId, fileName, sheetName, table, headerRow }: { companyId?: string; fileName: string; sheetName: string; table: unknown[][]; headerRow: number }) {
  const parsed = useMemo(() => parseImportRows(table, headerRow), [table, headerRow]);
  const groups = useMemo(() => groupDuplicates(parsed.rows), [parsed.rows]);
  const [skip, setSkip] = useState<Set<number>>(() => new Set(groups.flatMap((g) => g.slice(1))));
  const [state, setState] = useState<{ busy: boolean; message: string; error: string; batchId: string }>({ busy: false, message: "", error: "", batchId: "" });
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { void fetch(`/api/leads/import-distributors?${new URLSearchParams(companyId ? { companyId } : {})}`).then((r) => setEnabled(r.ok)).catch(() => setEnabled(false)); }, [companyId]);
  const toSave = parsed.rows.filter((_, i) => !skip.has(i));

  async function save() {
    setState({ busy: true, message: "", error: "", batchId: "" });
    let batchId = "", created = 0, skipped = 0;
    try {
      for (const part of chunk(toSave)) {
        const response = await fetch("/api/leads/import-distributors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, fileName, sheetName, total: toSave.length, batchId: batchId || undefined, rows: part }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "저장하지 못했습니다.");
        batchId = body.batchId; created += body.created; skipped += body.skipped;
        setState((s) => ({ ...s, batchId, message: `${created}개 저장 중…` }));
      }
      setState({ busy: false, error: "", batchId, message: `${created}개 저장했습니다.${skipped ? ` 이미 있는 번호 ${skipped}개는 건너뜀.` : ""}` });
    } catch (e) { setState({ busy: false, message: "", batchId, error: `${e instanceof Error ? e.message : "저장하지 못했습니다."}${batchId ? " 이미 저장된 것은 '되돌리기'로 지울 수 있습니다." : ""}` }); }
  }
  async function undo() {
    if (!state.batchId || !window.confirm("이번 가져오기로 저장한 유통사 리드를 모두 지울까요?")) return;
    setState((s) => ({ ...s, busy: true, error: "" }));
    const response = await fetch(`/api/leads/import-distributors?${new URLSearchParams({ ...(companyId ? { companyId } : {}), batchId: state.batchId })}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setState(response.ok ? { busy: false, message: `${body.removed}개를 되돌렸습니다.`, error: "", batchId: "" } : (s) => ({ ...s, busy: false, error: body.message || "되돌리지 못했습니다." }));
  }

  if (!enabled) return null;
  return <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
    <h3 className="font-black">유통사로 저장</h3>
    <p className="text-sm text-slate-700">저장할 행 {toSave.length.toLocaleString()}개 · 오류 {parsed.errors.length}줄(상호 없음, 저장 안 함) · 중복 의심 {groups.length}묶음. 상태는 영업 단계로 바뀌어 저장됩니다(계약완료→계약 등).</p>
    {groups.length ? <div className="space-y-2" aria-label="중복 의심 묶음">{groups.slice(0, 50).map((g) => <fieldset className="rounded border bg-white p-2 text-sm" key={g[0]}><legend className="px-1 text-xs font-bold text-amber-800">같은 상호·번호</legend>{g.map((i) => <label className="flex min-h-[44px] items-center gap-2" key={i}><input checked={!skip.has(i)} onChange={(e) => setSkip((prev) => { const next = new Set(prev); if (e.target.checked) next.delete(i); else next.add(i); return next; })} type="checkbox" />{parsed.rows[i].name} · {parsed.rows[i].phone || "번호 없음"} · {parsed.rows[i].region}</label>)}</fieldset>)}{groups.length > 50 ? <p className="text-xs text-slate-500">앞 50묶음만 보입니다. 나머지는 첫 줄만 저장합니다.</p> : null}</div> : null}
    {state.message ? <p className="text-sm font-bold text-teal-800" role="status">{state.message}</p> : null}
    {state.error ? <p className="text-sm font-bold text-rose-700" role="alert">{state.error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button className="maju-button-primary min-h-[44px] px-4" disabled={state.busy || !toSave.length} onClick={() => void save()} type="button">{toSave.length.toLocaleString()}개 저장</button>
      {state.batchId ? <button className="min-h-[44px] rounded-lg border px-4" disabled={state.busy} onClick={() => void undo()} type="button">되돌리기</button> : null}
    </div>
  </div>;
}
