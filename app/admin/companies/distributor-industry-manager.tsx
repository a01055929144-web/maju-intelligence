"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DistributorIndustryCategory, DistributorIndustryImpact, DistributorIndustryList } from "@/lib/admin-distributor-industries";

type Props = { companyId: string; companyName: string };

export function DistributorIndustryManager({ companyId, companyName }: Props) {
  const [data, setData] = useState<DistributorIndustryList | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [impact, setImpact] = useState<DistributorIndustryImpact | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [previewedCategoryId, setPreviewedCategoryId] = useState<string | null>(null);

  async function request(body?: Record<string, unknown>) {
    const response = await fetch(`/api/admin/distributor-industries?companyId=${encodeURIComponent(companyId)}`, body ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body })
    } : undefined);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || "업종 정보를 처리하지 못했습니다.");
    return payload;
  }

  async function load() {
    setBusy(true); setMessage(""); setImpact(null);
    try { const payload = await request() as DistributorIndustryList; setData(payload); setSelected(payload.assignedCategoryIds); }
    catch (error) { setMessage(error instanceof Error ? error.message : "업종 정보를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function previewAssignments() {
    setBusy(true); setMessage("");
    try { setImpact(await request({ action: "preview_assignment", categoryIds: selected }) as DistributorIndustryImpact); }
    catch (error) { setMessage(error instanceof Error ? error.message : "영향을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function saveAssignments() {
    if (!impact) return;
    setBusy(true); setMessage("");
    try { await request({ action: "set_assignment", categoryIds: selected, requestKey: crypto.randomUUID() }); setImpact(null); await load(); setMessage("유통사 업종 배정을 저장했습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "배정을 저장하지 못했습니다."); setBusy(false); }
  }

  async function previewCategory(category: DistributorIndustryCategory) {
    setBusy(true); setMessage("");
    try { const result = await request({ action: "preview_category", categoryId: category.id }) as DistributorIndustryImpact; setPreviewedCategoryId(category.id); setMessage(`${category.displayName}: ${result.assignedCompanyCount || 0}개 회사 · ${result.affectedStoreCount}개 매장에 영향`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "영향을 확인하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function saveCategory(category: DistributorIndustryCategory) {
    setBusy(true); setMessage("");
    try { await request({ action: "save_category", categoryId: category.id, displayName: category.displayName, status: category.status, requestKey: crypto.randomUUID() }); setPreviewedCategoryId(null); await load(); setMessage("업종 분류를 저장했습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "분류를 저장하지 못했습니다."); setBusy(false); }
  }

  async function addCategory() {
    if (!newName.trim()) return;
    setBusy(true); setMessage("");
    try { await request({ action: "save_category", displayName: newName, status: "active", requestKey: crypto.randomUUID() }); setNewName(""); setPreviewedCategoryId(null); await load(); setMessage("업종 분류를 추가했습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "분류를 추가하지 못했습니다."); setBusy(false); }
  }

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white" id="distributor-industries">
      <div className="border-b border-slate-200 p-4">
        <p className="font-black">유통사 업종 관리</p>
        <p className="mt-1 text-xs font-bold leading-5 text-muted-foreground">{companyName}에 여러 업종을 배정합니다. 기존 기본 업종 입력값은 바뀌지 않습니다.</p>
      </div>
      <div className="space-y-5 p-4">
        {message ? <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-900" role="status"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{message}</p> : null}
        {!data ? <Button disabled={busy} onClick={() => void load()} type="button">{busy ? "불러오는 중" : "다시 불러오기"}</Button> : <>
          <div className="space-y-2">
            <h3 className="text-sm font-black">업종 분류</h3>
            {data.categories.map((category, index) => (
              <div className="grid min-w-0 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto_auto]" key={category.id}>
                <input aria-label={`업종 표시명 ${index + 1}`} className="h-10 min-w-0 rounded-md border px-3 text-sm" onChange={(e) => { setPreviewedCategoryId(null); setData({ ...data, categories: data.categories.map((item) => item.id === category.id ? { ...item, displayName: e.target.value } : item) }); }} value={category.displayName} />
                <select aria-label={`${category.displayName} 상태`} className="h-10 rounded-md border px-2 text-sm" onChange={(e) => { setPreviewedCategoryId(null); setData({ ...data, categories: data.categories.map((item) => item.id === category.id ? { ...item, status: e.target.value as "active" | "retired" } : item) }); }} value={category.status}><option value="active">사용</option><option value="retired">종료</option></select>
                <Button disabled={busy} onClick={() => void previewCategory(category)} type="button" variant="outline">영향 확인</Button>
                <Button disabled={busy || previewedCategoryId !== category.id} onClick={() => void saveCategory(category)} type="button"><Save className="mr-1 h-4 w-4" />저장</Button>
              </div>
            ))}
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row"><input aria-label="새 업종 표시명" className="h-10 min-w-0 flex-1 rounded-md border px-3 text-sm" onChange={(e) => { setNewName(e.target.value); setPreviewedCategoryId(null); }} placeholder="새 업종 표시명" value={newName} /><Button disabled={busy || !newName.trim()} onClick={() => { setPreviewedCategoryId("new"); setMessage("새 분류는 기존 회사와 매장에 영향이 없습니다."); }} type="button" variant="outline">영향 확인</Button><Button disabled={busy || !newName.trim() || previewedCategoryId !== "new"} onClick={() => void addCategory()} type="button" variant="outline"><Plus className="mr-1 h-4 w-4" />추가</Button></div>
          </div>
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-black">{companyName} 업종 배정</h3>
            <div className="grid gap-2 sm:grid-cols-2">{data.categories.filter((category) => category.status === "active").map((category) => <label className="flex min-w-0 items-center gap-2 rounded-md border p-3 text-sm font-bold" key={category.id}><input checked={selected.includes(category.id)} onChange={(e) => { setImpact(null); setSelected(e.target.checked ? [...selected, category.id] : selected.filter((id) => id !== category.id)); }} type="checkbox" /> <span className="truncate">{category.displayName}</span></label>)}</div>
            {impact ? <p className="text-sm font-bold text-slate-700">변경 시 활성 연결 {impact.activeConnectionCount}건 · 매장 {impact.affectedStoreCount}곳에 영향</p> : null}
            <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void previewAssignments()} type="button" variant="outline">변경 영향 확인</Button><Button disabled={busy || !impact} onClick={() => void saveAssignments()} type="button">배정 저장</Button></div>
          </div>
        </>}
      </div>
    </section>
  );
}
