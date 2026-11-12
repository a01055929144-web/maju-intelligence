"use client";
import { useEffect, useMemo, useState } from "react";
import { chunk, groupDuplicates, parseImportRows } from "@/domains/lead/distributor-import";

// CC-21: 유통사로 저장. 중복 의심 묶음은 대표가 고르고(기본: 묶음의 첫 줄만 저장), 500행씩 저장, 저장 뒤 되돌리기.
export function DistributorImportSave({ companyId, fileName, sheetName, table, headerRow, onChanged }: { onChanged?: () => void; companyId?: string; fileName: string; sheetName: string; table: unknown[][]; headerRow: number }) {
  const parsed = useMemo(() => parseImportRows(table, headerRow), [table, headerRow]);
  const groups = useMemo(() => groupDuplicates(parsed.rows), [parsed.rows]);
  const [skip, setSkip] = useState<Set<number>>(() => new Set(groups.flatMap((g) => g.slice(1))));
  const [state, setState] = useState<{ busy: boolean; message: string; error: string; batchId: string }>({ busy: false, message: "", error: "", batchId: "" });
  const [enabled, setEnabled] = useState(false);
  const checkEnabled = () => void fetch(`/api/leads/import-distributors?${new URLSearchParams({ ...(companyId ? { companyId } : {}), list: "1" })}`, { cache: "no-store" })
    .then(async (r) => { setEnabled(r.ok); })
    .catch(() => setEnabled(false));
  useEffect(() => { checkEnabled(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const toSave = parsed.rows.filter((_, i) => !skip.has(i));

  async function save() {
    setState({ busy: true, message: "", error: "", batchId: "" });
    let batchId = "", created = 0, skipped = 0, fieldsCreated = 0;
    try {
      for (const part of chunk(toSave)) {
        const response = await fetch("/api/leads/import-distributors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, fileName, sheetName, total: toSave.length, batchId: batchId || undefined, columns: parsed.columns, rows: part }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "저장하지 못했습니다.");
        batchId = body.batchId; created += body.created; skipped += body.skipped; fieldsCreated += body.fieldsCreated ?? 0;
        setState((s) => ({ ...s, batchId, message: `${created}개 저장 중…` }));
      }
      setState({ busy: false, error: "", batchId, message: `${created}개 저장했습니다.${fieldsCreated ? ` 새 회사 칸 ${fieldsCreated}개를 만들었습니다.` : ""}${skipped ? ` 이미 있는 번호 ${skipped}개는 건너뜀.` : ""}` });
      onChanged?.();
    } catch (e) { setState({ busy: false, message: "", batchId, error: `${e instanceof Error ? e.message : "저장하지 못했습니다."}${batchId ? " 이미 저장된 것은 '되돌리기'로 지울 수 있습니다." : ""}` }); }
  }
  async function undo() {
    const id = state.batchId;
    if (!id || !window.confirm("이번 가져오기로 저장한 유통사 리드를 모두 지울까요? (연락 기록이 있으면 되돌릴 수 없습니다. 이미 만든 회사 칸은 남습니다.)")) return;
    setState((s) => ({ ...s, busy: true, error: "" }));
    const result = await undoDistributorBatch(companyId, id);
    setState(result.ok ? { busy: false, message: `${result.removed.toLocaleString()}개를 되돌렸습니다.`, error: "", batchId: "" } : (s) => ({ ...s, busy: false, error: result.message }));
    if (result.ok) onChanged?.();
  }

  if (!enabled) return null;
  return <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
    <h3 className="font-black">유통사로 저장</h3>
    <p className="text-sm text-slate-700">저장할 행 {toSave.length.toLocaleString()}개 · 오류 {parsed.errors.length}줄(상호 없음, 저장 안 함) · 중복 의심 {groups.length}묶음. 상태는 영업 단계로 바뀌어 저장됩니다(계약완료→계약 등).</p>
    {groups.length ? <div className="space-y-2" aria-label="중복 의심 묶음">{groups.slice(0, 50).map((g) => <fieldset className="rounded border bg-white p-2 text-sm" key={g[0]}><legend className="px-1 text-xs font-bold text-amber-800">같은 상호·번호</legend>{g.map((i) => <label className="flex min-h-[44px] items-center gap-2" key={i}><input checked={!skip.has(i)} onChange={(e) => setSkip((prev) => { const next = new Set(prev); if (e.target.checked) next.delete(i); else next.add(i); return next; })} type="checkbox" />{parsed.rows[i].name} · {parsed.rows[i].phone || "번호 없음"} · {parsed.rows[i].region}</label>)}</fieldset>)}{groups.length > 50 ? <p className="text-xs text-slate-500">앞 50묶음만 보입니다. 나머지는 첫 줄만 저장합니다.</p> : null}</div> : null}
    {parsed.columns.length ? <p className="text-xs text-slate-600">표준 칸에 맞지 않는 칸 {parsed.columns.length}개({parsed.columns.slice(0, 6).map((c) => c.label).join(", ")}{parsed.columns.length > 6 ? " …" : ""})는 버리지 않고 <b>회사 칸으로 만들어 저장</b>합니다(같은 이름이 있으면 그 칸에 저장, 날짜만 든 칸은 날짜 칸).</p> : null}
    {state.message ? <p className="text-sm font-bold text-teal-800" role="status">{state.message}</p> : null}
    {state.error ? <p className="text-sm font-bold text-rose-700" role="alert">{state.error}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button className="maju-button-primary min-h-[44px] px-4" disabled={state.busy || !toSave.length} onClick={() => void save()} type="button">{toSave.length.toLocaleString()}개 저장</button>
      {state.batchId ? <button className="min-h-[44px] rounded-lg border px-4" disabled={state.busy} onClick={() => void undo()} type="button">되돌리기</button> : null}
    </div>
  </div>;
}

async function undoDistributorBatch(companyId: string | undefined, batchId: string): Promise<{ ok: true; removed: number } | { ok: false; message: string }> {
  try {
    const response = await fetch(`/api/leads/import-distributors?${new URLSearchParams({ ...(companyId ? { companyId } : {}), batchId })}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, removed: Number(body.removed) || 0 } : { ok: false, message: body.message || "되돌리지 못했습니다." };
  } catch { return { ok: false, message: "되돌리지 못했습니다. 네트워크를 확인해 주세요." }; }
}

/** CC-21: 엑셀 가져오기 탭 첫 화면에 항상 보이는 "이전 가져오기 되돌리기" 목록(파일을 고르기 전에도). 스위치 꺼진 회사는 아무것도 안 그린다. */
export function DistributorImportHistory({ companyId, refreshKey, onChanged }: { companyId?: string; refreshKey: number; onChanged: () => void }) {
  const [batches, setBatches] = useState<Array<{ id: string; fileName: string; createdAt: string; saved: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/leads/import-distributors?${new URLSearchParams({ ...(companyId ? { companyId } : {}), list: "1" })}`, { cache: "no-store" })
      .then(async (r) => { if (alive) setBatches(r.ok ? ((await r.json()) as { batches?: typeof batches }).batches ?? [] : []); })
      .catch(() => { if (alive) setBatches([]); });
    return () => { alive = false; };
  }, [companyId, refreshKey]);
  async function undo(b: (typeof batches)[number]) {
    if (!window.confirm(`"${b.fileName}" ${b.saved.toLocaleString()}개로 저장한 유통사 리드를 모두 지울까요? (연락 기록이 있으면 되돌릴 수 없습니다. 이미 만든 회사 칸은 남습니다.)`)) return;
    setBusy(true); setMessage(null);
    const result = await undoDistributorBatch(companyId, b.id);
    setBusy(false);
    setMessage(result.ok ? { ok: true, text: `${result.removed.toLocaleString()}개를 되돌렸습니다.` } : { ok: false, text: result.message });
    if (result.ok) onChanged();
  }
  if (!batches.length && !message) return null;
  return <section aria-label="이전 가져오기 되돌리기" className="rounded-xl border bg-white p-3 text-sm">
    <h3 className="font-black">이전 가져오기 되돌리기 ({batches.length})</h3>
    {message ? <p className={`mt-1 text-sm font-bold ${message.ok ? "text-teal-800" : "text-rose-700"}`} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}
    <ul className="mt-2 divide-y">{batches.map((b) => <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={b.id}>
      <span className="min-w-0 truncate">{b.fileName} · {new Date(b.createdAt).toLocaleString("ko-KR")} · {b.saved.toLocaleString()}개</span>
      <button className="min-h-[36px] rounded-lg border px-3 text-xs font-bold" disabled={busy} onClick={() => void undo(b)} type="button">되돌리기</button>
    </li>)}</ul>
  </section>;
}
