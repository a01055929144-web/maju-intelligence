"use client";

import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { DeliveryMessageTemplate } from "@/lib/store";

export function MessageTemplateManager({ compact = false, mode, onSelect }: { compact?: boolean; mode: "company" | "driver"; onSelect?: (body: string) => void }) {
  const [templates, setTemplates] = useState<DeliveryMessageTemplate[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetchWithTimeout(`/api/customer/message-templates?mode=${mode}`, { cache: "no-store" }, 12000).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) as { templates?: DeliveryMessageTemplate[] } | null : null;
    setTemplates(payload?.templates || []);
    setLoading(false);
  }, [mode]);

  useEffect(() => { void load(); }, [load]);

  function addTemplate() {
    setTemplates((current) => [...current, { body: "{매장명} ", label: "새 템플릿", sortOrder: current.length * 10 + 10, templateKey: `custom_${Date.now()}` }]);
    setEditing(true);
  }

  function update(index: number, patch: Partial<DeliveryMessageTemplate>) {
    setTemplates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function move(index: number, direction: -1 | 1) {
    setTemplates((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetchWithTimeout("/api/customer/message-templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, templates }) }, 15000).catch(() => null);
    const payload = await response?.json().catch(() => null) as { message?: string; templates?: DeliveryMessageTemplate[] } | null;
    setSaving(false);
    if (!response?.ok) { setMessage(payload?.message || "저장하지 못했습니다."); return; }
    setTemplates(payload?.templates || templates);
    setEditing(false);
    setMessage("템플릿을 저장했습니다.");
  }

  async function importDefaults() {
    setLoading(true);
    setMessage("");
    const response = await fetchWithTimeout("/api/customer/message-templates?mode=driver&import=1", { cache: "no-store" }, 12000).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) as { templates?: DeliveryMessageTemplate[] } | null : null;
    setLoading(false);
    if (!response?.ok) { setMessage("공통 템플릿을 가져오지 못했습니다."); return; }
    setTemplates(payload?.templates || []);
    setMessage("새 공통 템플릿을 가져왔습니다. 내 수정 문구는 유지됩니다.");
  }

  return <div className={`message-template-manager ${compact ? "mt-3" : "rounded-lg border border-slate-200 bg-slate-50 p-4"}`}>
    <div className="flex items-center justify-between gap-2">
      <div><p className={`font-black ${compact ? "text-xs text-slate-300" : "text-sm text-slate-950"}`}>{mode === "company" ? "회사 공통 배송 템플릿" : "내 배송 메시지 템플릿"}</p>{!compact ? <p className="mt-1 text-xs font-semibold text-slate-500">추가·수정·삭제한 공통 문구는 기사 계정의 ‘새 공통 문구 가져오기’에 반영됩니다.</p> : null}</div>
      <div className="flex gap-1.5">{mode === "driver" ? <button className={`h-9 rounded-lg px-2 text-[11px] font-black ${compact ? "border border-slate-700 text-teal-300" : "border border-slate-200 bg-white text-teal-700"}`} onClick={importDefaults} type="button">공통 가져오기</button> : null}<button className={`inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-black ${compact ? "border border-slate-700 text-[#9bb4ef]" : "border border-slate-200 bg-white text-slate-700"}`} onClick={() => setEditing((value) => !value)} type="button"><Pencil className="h-3.5 w-3.5" />{editing ? "닫기" : "편집"}</button></div>
    </div>
    {loading ? <p className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중</p> : null}
    {!editing ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{templates.map((template) => <button className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${compact ? "border border-slate-700 bg-[#151c29] text-slate-200" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200"}`} key={template.templateKey} onClick={() => onSelect?.(template.body)} type="button">{template.label}</button>)}</div> : null}
    {editing ? <div className="mt-3 space-y-2">{templates.map((template, index) => <div className={`rounded-xl border p-3 ${compact ? "border-slate-700 bg-[#151c29]" : "border-slate-200 bg-white"}`} key={template.templateKey}><div className="flex gap-2"><input aria-label="템플릿 이름" className={`h-9 min-w-0 flex-1 rounded-lg border px-2 text-xs font-bold ${compact ? "border-slate-700 bg-[#111827] text-white" : "border-slate-200"}`} onChange={(event) => update(index, { label: event.target.value })} value={template.label} /><button aria-label="위로" className="p-2" onClick={() => move(index, -1)} type="button"><ChevronUp className="h-4 w-4" /></button><button aria-label="아래로" className="p-2" onClick={() => move(index, 1)} type="button"><ChevronDown className="h-4 w-4" /></button><button aria-label="삭제" className="p-2 text-rose-500" onClick={() => setTemplates((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button"><Trash2 className="h-4 w-4" /></button></div><textarea aria-label={`${template.label} 내용`} className={`mt-2 min-h-20 w-full rounded-lg border p-2 text-xs font-semibold ${compact ? "border-slate-700 bg-[#111827] text-white" : "border-slate-200"}`} onChange={(event) => update(index, { body: event.target.value })} value={template.body} /></div>)}</div> : null}
    {editing ? <div className="mt-3 flex gap-2"><button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-black" onClick={addTemplate} type="button"><Plus className="h-4 w-4" />추가</button><button className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-black text-white disabled:opacity-50" disabled={saving} onClick={save} type="button"><Save className="h-4 w-4" />{saving ? "저장 중" : "변경 저장"}</button></div> : null}
    {message ? <p className={`mt-2 text-xs font-bold ${message.includes("못") ? "text-rose-500" : "text-teal-500"}`}>{message}</p> : null}
  </div>;
}
