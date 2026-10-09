"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Edit3, Loader2, PackageSearch, Search, X } from "lucide-react";
import type { ProductCatalogAdminItem } from "@/lib/product-catalog-admin";

const statusMeta: Record<ProductCatalogAdminItem["matchStatus"], { label: string; className: string }> = {
  matched: { label: "매칭", className: "bg-emerald-50 text-emerald-700" },
  unmatched: { label: "미매칭", className: "bg-amber-50 text-amber-800" },
  requested: { label: "의뢰 품목", className: "bg-blue-50 text-blue-700" },
  inactive: { label: "사용 중지", className: "bg-slate-100 text-slate-600" }
};

function money(value?: number) {
  return value == null ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

export function ProductCatalogAdmin({ companyId = "" }: { companyId?: string }) {
  const [items, setItems] = useState<ProductCatalogAdminItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ProductCatalogAdminItem["matchStatus"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ProductCatalogAdminItem | null>(null);

  async function load(search = "") {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (companyId) params.set("companyId", companyId);
    try {
      const response = await fetch(`/api/product-catalog?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { items?: ProductCatalogAdminItem[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "상품 원장을 불러오지 못했습니다.");
      setItems(payload.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "상품 원장을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleItems = useMemo(() => filter === "all" ? items : items.filter((item) => item.matchStatus === filter), [filter, items]);
  const counts = useMemo(() => ({
    matched: items.filter((item) => item.matchStatus === "matched").length,
    requested: items.filter((item) => item.matchStatus === "requested").length,
    unmatched: items.filter((item) => item.matchStatus === "unmatched").length
  }), [items]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    void load(query);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["matched", "unmatched", "requested"] as const).map((status) => (
          <button className="maju-stat-card text-left" key={status} onClick={() => setFilter(filter === status ? "all" : status)} type="button">
            <p className="maju-muted-label">{statusMeta[status].label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{counts[status].toLocaleString()}건</p>
          </button>
        ))}
      </div>

      <section className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="maju-section-title">매입 ↔ 판매 품목 매칭</h2><p className="mt-1 maju-muted-label">매입 원장의 품목을 판매용 명칭과 가격으로 연결합니다.</p></div>
          <form className="flex w-full gap-2 sm:w-auto" onSubmit={submitSearch}>
            <label className="relative min-w-0 flex-1 sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><span className="sr-only">상품 검색</span><input className="maju-input w-full pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="매입·판매 상품명 검색" value={query} /></label>
            <button className="maju-button-secondary" type="submit">검색</button>
          </form>
        </div>

        {error ? <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800" role="alert">{error}</div> : null}
        {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />상품 원장을 불러오는 중입니다.</div> : null}
        {!loading && !error && !visibleItems.length ? <div className="flex flex-col items-center gap-2 p-12 text-center"><PackageSearch className="h-8 w-8 text-slate-400" /><p className="font-bold text-slate-700">조건에 맞는 품목이 없습니다.</p></div> : null}
        {!loading && visibleItems.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-4 py-3">상태</th><th className="px-4 py-3">매입 품목</th><th className="px-4 py-3">규격 / 단위</th><th className="px-4 py-3 text-right">매입가</th><th className="px-4 py-3">판매 품목</th><th className="px-4 py-3">판매 규격 / 단위</th><th className="px-4 py-3 text-right">판매가</th><th className="px-4 py-3 text-right">관리</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((item) => <tr className="hover:bg-slate-50" key={item.id}><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusMeta[item.matchStatus].className}`}>{statusMeta[item.matchStatus].label}</span></td><td className="px-4 py-3 font-bold text-slate-900">{item.name}</td><td className="px-4 py-3 text-slate-600">{item.spec || "-"} / {item.unit}</td><td className="px-4 py-3 text-right font-semibold">{money(item.purchasePrice)}</td><td className="px-4 py-3 font-semibold text-slate-800">{item.salesName || "연결 대기"}</td><td className="px-4 py-3 text-slate-600">{item.salesSpec || "-"} / {item.salesUnit || "-"}</td><td className="px-4 py-3 text-right font-semibold">{money(item.salesPrice)}</td><td className="px-4 py-3 text-right"><button className="maju-button-secondary inline-flex h-9 items-center gap-1.5 px-3" onClick={() => setEditing(item)} type="button"><Edit3 className="h-4 w-4" />편집</button></td></tr>)}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {editing ? <EditDialog companyId={companyId} item={editing} onClose={() => setEditing(null)} onSaved={(saved) => { setItems((current) => current.map((item) => item.id === saved.id ? saved : item)); setEditing(null); }} /> : null}
    </div>
  );
}

function EditDialog({ companyId, item, onClose, onSaved }: { companyId: string; item: ProductCatalogAdminItem; onClose: () => void; onSaved: (item: ProductCatalogAdminItem) => void }) {
  const [draft, setDraft] = useState(item);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof ProductCatalogAdminItem, value: string | number) => setDraft((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/product-catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, companyId }) });
      const payload = (await response.json()) as { item?: ProductCatalogAdminItem; message?: string };
      if (!response.ok || !payload.item) throw new Error(payload.message || "품목을 저장하지 못했습니다.");
      onSaved(payload.item);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "품목을 저장하지 못했습니다."); } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation"><form aria-label="상품 매칭 편집" className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onSubmit={save}><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-lg font-black">상품 매칭 편집</h2><p className="text-sm text-slate-500">매입 정보와 판매용 정보를 함께 관리합니다.</p></div><button aria-label="닫기" className="rounded-lg p-2 hover:bg-slate-100" onClick={onClose} type="button"><X className="h-5 w-5" /></button></div><div className="grid gap-4 p-5 sm:grid-cols-2"><Field label="매입 상품명"><input className="maju-input w-full" onChange={(e) => set("name", e.target.value)} required value={draft.name} /></Field><Field label="상태"><select className="maju-input w-full" onChange={(e) => set("matchStatus", e.target.value)} value={draft.matchStatus}>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field><Field label="매입 규격"><input className="maju-input w-full" onChange={(e) => set("spec", e.target.value)} value={draft.spec || ""} /></Field><Field label="매입 단위"><input className="maju-input w-full" onChange={(e) => set("unit", e.target.value)} required value={draft.unit} /></Field><Field label="매입가"><input className="maju-input w-full" min="0" onChange={(e) => set("purchasePrice", Number(e.target.value))} type="number" value={draft.purchasePrice} /></Field><div /><Field label="판매 상품명"><input className="maju-input w-full" onChange={(e) => set("salesName", e.target.value)} value={draft.salesName || ""} /></Field><Field label="판매가"><input className="maju-input w-full" min="0" onChange={(e) => set("salesPrice", e.target.value === "" ? "" : Number(e.target.value))} type="number" value={draft.salesPrice ?? ""} /></Field><Field label="판매 규격"><input className="maju-input w-full" onChange={(e) => set("salesSpec", e.target.value)} value={draft.salesSpec || ""} /></Field><Field label="판매 단위"><input className="maju-input w-full" onChange={(e) => set("salesUnit", e.target.value)} value={draft.salesUnit || ""} /></Field>{error ? <p className="sm:col-span-2 text-sm font-semibold text-rose-700" role="alert">{error}</p> : null}</div><div className="flex justify-end gap-2 border-t px-5 py-4"><button className="maju-button-secondary" onClick={onClose} type="button">취소</button><button className="maju-button-primary inline-flex items-center gap-2" disabled={saving} type="submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}저장</button></div></form></div>;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
