"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MapPinned, Plus, Save, X } from "lucide-react";
import type { CompanyStaffMemberOption, DeliveryTerritoryItem } from "@/lib/store";

type Draft = { id?: string; name: string; isActive: boolean; areasText: string; staffMemberIds: string[] };
const EMPTY_DRAFT: Draft = { name: "", isActive: true, areasText: "", staffMemberIds: [] };

export function TerritoryManagementPanel({
  canManage,
  initialStaff,
  initialTerritories
}: {
  canManage: boolean;
  initialStaff: CompanyStaffMemberOption[];
  initialTerritories: DeliveryTerritoryItem[];
}) {
  const [territories, setTerritories] = useState(initialTerritories);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const editing = Boolean(draft.id || draft.name || draft.areasText || draft.staffMemberIds.length);
  const staffById = useMemo(() => new Map(initialStaff.map((staff) => [staff.id, staff])), [initialStaff]);

  function open(item: DeliveryTerritoryItem) {
    setDraft({ id: item.id, name: item.name, isActive: item.isActive, areasText: item.areas.join("\n"), staffMemberIds: item.defaultStaff.map((staff) => staff.staffMemberId) });
    setMessage("");
  }

  function moveStaff(index: number, direction: -1 | 1) {
    const next = [...draft.staffMemberIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, staffMemberIds: next });
  }

  async function save(nextActive = draft.isActive) {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    setMessage("저장 중입니다...");
    const areas = draft.areasText.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
    const response = await fetch("/api/customer/territories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, isActive: nextActive, areas, staffMemberIds: draft.staffMemberIds })
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      setMessage(payload?.error || "권역을 저장하지 못했습니다.");
      return;
    }
    setTerritories(payload.territories || []);
    setDraft(EMPTY_DRAFT);
    setMessage(nextActive ? "권역을 저장했습니다." : "권역을 비활성화하고 시·군·구 연결을 해제했습니다.");
  }

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-teal-700"><MapPinned className="h-4 w-4" /> 배송 권역</p>
          <h2 className="text-2xl font-black text-slate-950">권역과 기본 담당자</h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">시·군·구를 권역으로 묶고 신규 거래처의 기본 담당자 순서를 정합니다.</p>
        </div>
        <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" disabled={!canManage} onClick={() => setDraft(EMPTY_DRAFT)} type="button">
          <Plus className="mr-1 inline h-4 w-4" /> 새 권역
        </button>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(420px,1.2fr)]">
        <div className="space-y-2">
          {territories.length ? territories.map((item) => (
            <button className={`w-full rounded-xl border p-4 text-left transition ${draft.id === item.id ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`} key={item.id} onClick={() => open(item)} type="button">
              <div className="flex items-center justify-between gap-2"><strong className="text-slate-950">{item.name}</strong><span className={`text-xs font-bold ${item.isActive ? "text-emerald-700" : "text-slate-400"}`}>{item.isActive ? "활성" : "비활성"}</span></div>
              <p className="mt-1 text-sm text-slate-500">{item.areas.length ? item.areas.join(" · ") : "연결된 시·군·구 없음"}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">기본 담당자 {item.defaultStaff.length}명</p>
            </button>
          )) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">아직 등록된 권역이 없습니다.</div>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="text-sm font-bold text-slate-700">권역명</label>
          <input className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: 강남권" value={draft.name} />
          <label className="mt-4 block text-sm font-bold text-slate-700">포함 시·군·구</label>
          <textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, areasText: event.target.value })} placeholder={"서울특별시 강남구\n서울특별시 서초구"} value={draft.areasText} />
          <p className="mt-1 text-xs text-slate-500">한 줄에 하나씩 입력합니다. 한 시·군·구는 한 권역에만 연결됩니다.</p>
          <label className="mt-4 block text-sm font-bold text-slate-700">기본 담당자 우선순위</label>
          <div className="mt-2 space-y-2">
            {draft.staffMemberIds.map((id, index) => (
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2" key={`${id}-${index}`}>
                <span className="w-6 text-center text-xs font-black text-teal-700">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{staffById.get(id)?.name || "미확인 직원"}</span>
                <button aria-label="위로" disabled={index === 0} onClick={() => moveStaff(index, -1)} type="button"><ChevronUp className="h-4 w-4" /></button>
                <button aria-label="아래로" disabled={index === draft.staffMemberIds.length - 1} onClick={() => moveStaff(index, 1)} type="button"><ChevronDown className="h-4 w-4" /></button>
                <button aria-label="제거" onClick={() => setDraft({ ...draft, staffMemberIds: draft.staffMemberIds.filter((_, current) => current !== index) })} type="button"><X className="h-4 w-4" /></button>
              </div>
            ))}
            <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" disabled={!canManage} onChange={(event) => { const id = event.target.value; if (id && !draft.staffMemberIds.includes(id)) setDraft({ ...draft, staffMemberIds: [...draft.staffMemberIds, id] }); event.target.value = ""; }} defaultValue="">
              <option value="">담당자 추가</option>
              {initialStaff.filter((staff) => !draft.staffMemberIds.includes(staff.id)).map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
            </select>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className={`text-sm font-semibold ${message.includes("못") ? "text-rose-700" : "text-slate-600"}`}>{message}</p>
            <div className="flex gap-2">
              {draft.id && draft.isActive ? <button className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700" disabled={!canManage || saving} onClick={() => save(false)} type="button">비활성화</button> : null}
              <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!canManage || saving || !editing || !draft.name.trim()} onClick={() => save(true)} type="button"><Save className="mr-1 inline h-4 w-4" />{saving ? "저장 중" : "권역 저장"}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
