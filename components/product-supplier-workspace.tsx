"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, FileSpreadsheet, PackageSearch, Save, Search, Truck } from "lucide-react";
import type { ProductSupplierDirectory, ProductSupplierSummary } from "@/lib/product-suppliers";

const money = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const date = (value?: string) => value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음";
const businessNumber = (value?: string) => {
  const digits = (value || "").replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

export function ProductSupplierWorkspace({ companyId = "", data }: { companyId?: string; data: ProductSupplierDirectory }) {
  const [suppliers, setSuppliers] = useState(data.suppliers);
  const [selectedId, setSelectedId] = useState(data.suppliers[0]?.id || "");
  const [query, setQuery] = useState("");
  const selected = suppliers.find((supplier) => supplier.id === selectedId);
  const products = useMemo(() => data.products.filter((item) => item.supplierId === selectedId && item.rawName.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"))), [data.products, query, selectedId]);
  const history = data.costHistory.filter((item) => item.supplierId === selectedId).slice(0, 100);
  const imports = data.imports.filter((item) => item.supplierId === selectedId);
  const uploadHref = companyId ? `/revenue/products?tab=supplier&companyId=${encodeURIComponent(companyId)}` : "/revenue/products?tab=supplier";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="활성 매입처" value={`${suppliers.filter((item) => item.isActive).length}곳`} />
        <Metric label="매입 상품" value={`${data.products.length.toLocaleString()}개`} />
        <Metric label="원가 비교 가능" value={`${data.comparisons.length.toLocaleString()}개 품목`} />
      </div>

      <div className="grid min-h-[620px] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="maju-section-card overflow-hidden">
          <div className="maju-card-header">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold text-teal-700">PURCHASING</p><h2 className="maju-section-title">매입처 목록</h2></div>
              <Link className="maju-button-secondary h-9 px-3 text-xs" href={uploadHref}><FileSpreadsheet className="h-4 w-4" /> 단가표</Link>
            </div>
          </div>
          <div className="max-h-[700px] divide-y overflow-y-auto">
            {suppliers.map((supplier) => (
              <button className={`w-full px-4 py-4 text-left transition ${selectedId === supplier.id ? "bg-teal-50 ring-1 ring-inset ring-teal-200" : "hover:bg-slate-50"}`} key={supplier.id} onClick={() => { setSelectedId(supplier.id); setQuery(""); }} type="button">
                <div className="flex items-start justify-between gap-2"><b className="text-sm text-slate-950">{supplier.name}</b><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${supplier.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{supplier.isActive ? "활성" : "비활성"}</span></div>
                <p className="mt-2 text-xs font-semibold text-slate-500">상품 {supplier.productCount.toLocaleString()}개 · 원가 확정 {supplier.confirmedCostRate}%</p>
                <p className="mt-1 text-xs text-slate-400">최근 업로드 {date(supplier.latestImportAt)}</p>
              </button>
            ))}
            {!suppliers.length ? <div className="p-10 text-center text-sm font-semibold text-slate-500">매입 단가표를 업로드하면 매입처가 생성됩니다.</div> : null}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <>
              <SupplierProfileCard
                companyId={companyId}
                key={selected.id}
                onSaved={(supplier) => {
                  setSuppliers((current) => current.map((item) => (
                    item.id === supplier.id ? { ...item, ...supplier } : item
                  )));
                }}
                supplier={selected}
              />
              <section className="maju-section-card">
                <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-bold text-teal-700">SUPPLIER DETAIL</p><h2 className="maju-section-title">{selected.name}</h2><p className="mt-1 maju-muted-label">상품 {selected.productCount.toLocaleString()}개 · 최근 업로드 {date(selected.latestImportAt)}</p></div>
                  <Link className="maju-button-secondary" href={uploadHref}>새 단가표 업로드 <ArrowRight className="h-4 w-4" /></Link>
                </div>
                <div className="border-t border-slate-100 p-4">
                  <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="maju-input w-full pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="매입 상품명 검색" value={query} /></div>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">매입 상품</th><th className="p-3">규격·단위</th><th className="p-3 text-right">최신 원가</th><th className="p-3">원가 상태</th><th className="p-3">연결 마스터 상품</th><th className="p-3">관측일</th></tr></thead><tbody className="divide-y">{products.map((product) => <tr key={product.id}><td className="p-3 font-semibold">{product.rawName}</td><td className="p-3 text-slate-600">{product.rawSpec || "-"} · {product.rawUnit || "-"}</td><td className="p-3 text-right font-bold">{product.latestCost == null ? "-" : money(product.latestCost)}</td><td className="p-3">{product.costConfirmed ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />확정</span> : <span className="font-bold text-amber-700">확인 필요</span>}</td><td className="p-3">{product.matchedCatalogName || <span className="text-slate-400">미연결</span>}</td><td className="p-3 text-slate-500">{date(product.lastSeenDate)}</td></tr>)}</tbody></table>
                    {!products.length ? <div className="p-10 text-center text-sm text-slate-500">조건에 맞는 매입 상품이 없습니다.</div> : null}
                  </div>
                </div>
              </section>

              <div className="grid gap-4 2xl:grid-cols-2">
                <DataCard icon={PackageSearch} title="원가 이력" subtitle="최근 100건">
                  {history.slice(0, 12).map((item) => <Row key={item.id} left={`${item.productName} · ${item.priceDate}`} right={money(item.purchasePrice)} />)}
                  {!history.length ? <Empty text="저장된 원가 이력이 없습니다." /> : null}
                </DataCard>
                <DataCard icon={FileSpreadsheet} title="업로드 이력" subtitle={`${imports.length}건`}>
                  {imports.slice(0, 12).map((item) => <Row key={item.id} left={`${item.fileName} · ${date(item.completedAt || item.createdAt)}`} right={`${item.status} · ${item.totalRows.toLocaleString()}행`} />)}
                  {!imports.length ? <Empty text="저장된 업로드 이력이 없습니다." /> : null}
                </DataCard>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <section className="maju-section-card">
        <div className="maju-card-header"><p className="text-xs font-bold text-teal-700">INTERNAL COST</p><h2 className="maju-section-title">같은 마스터 상품의 매입처별 원가 비교</h2><p className="mt-1 maju-muted-label">현재 회사가 보유한 확정 원가만 비교합니다. 다른 회사 데이터는 포함하지 않습니다.</p></div>
        <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">{data.comparisons.slice(0, 20).map((comparison) => <div className="rounded-xl border border-slate-200 p-4" key={comparison.catalogId}><b>{comparison.catalogName}</b><div className="mt-3 space-y-2">{comparison.offers.toSorted((a, b) => a.cost - b.cost).map((offer) => <div className="flex items-center justify-between gap-3 text-sm" key={`${comparison.catalogId}-${offer.supplierId}`}><span className="text-slate-600">{offer.supplierName}</span><span className="font-bold">{money(offer.cost)}</span></div>)}</div></div>)}</div>
        {!data.comparisons.length ? <Empty text="두 곳 이상의 매입처에 연결된 확정 원가가 아직 없습니다." /> : null}
      </section>
    </div>
  );
}

function SupplierProfileCard({
  companyId,
  onSaved,
  supplier
}: {
  companyId: string;
  onSaved: (supplier: ProductSupplierSummary) => void;
  supplier: ProductSupplierSummary;
}) {
  const [form, setForm] = useState({
    businessNumber: businessNumber(supplier.businessNumber),
    contactEmail: supplier.contactEmail || "",
    contactName: supplier.contactName || "",
    contactPhone: supplier.contactPhone || "",
    memo: supplier.memo || "",
    paymentTerms: supplier.paymentTerms || "",
    representativeName: supplier.representativeName || ""
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/product-suppliers/${supplier.id}`, {
        body: JSON.stringify({ ...form, companyId: companyId || undefined }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "매입처 기본정보를 저장하지 못했습니다.");
      onSaved(payload.supplier);
      setMessage("저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "매입처 기본정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="maju-section-card">
      <form onSubmit={save}>
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-teal-700">SUPPLIER PROFILE</p>
            <h2 className="maju-section-title">{supplier.name} 기본정보</h2>
            <p className="mt-1 maju-muted-label">계약과 정산에 필요한 매입처 정보를 관리합니다.</p>
          </div>
          <button className="maju-button-primary" disabled={saving} type="submit">
            <Save className="h-4 w-4" /> {saving ? "저장 중" : "기본정보 저장"}
          </button>
        </div>
        <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-2 xl:grid-cols-3">
          <ProfileField label="사업자등록번호" hint="숫자 10자리">
            <input
              className="maju-input w-full"
              inputMode="numeric"
              maxLength={12}
              onChange={(event) => update("businessNumber", businessNumber(event.target.value))}
              placeholder="000-00-00000"
              value={form.businessNumber}
            />
          </ProfileField>
          <ProfileField label="대표자">
            <input className="maju-input w-full" maxLength={100} onChange={(event) => update("representativeName", event.target.value)} value={form.representativeName} />
          </ProfileField>
          <ProfileField label="담당자">
            <input className="maju-input w-full" maxLength={100} onChange={(event) => update("contactName", event.target.value)} value={form.contactName} />
          </ProfileField>
          <ProfileField label="담당자 연락처">
            <input className="maju-input w-full" maxLength={30} onChange={(event) => update("contactPhone", event.target.value)} value={form.contactPhone} />
          </ProfileField>
          <ProfileField label="담당자 이메일">
            <input className="maju-input w-full" maxLength={254} onChange={(event) => update("contactEmail", event.target.value)} type="email" value={form.contactEmail} />
          </ProfileField>
          <ProfileField label="결제 조건">
            <input className="maju-input w-full" maxLength={500} onChange={(event) => update("paymentTerms", event.target.value)} placeholder="예: 월말 마감, 익월 10일 지급" value={form.paymentTerms} />
          </ProfileField>
          <div className="md:col-span-2 xl:col-span-3">
            <ProfileField label="메모">
              <textarea className="maju-input min-h-24 w-full resize-y py-3" maxLength={4000} onChange={(event) => update("memo", event.target.value)} value={form.memo} />
            </ProfileField>
          </div>
          {message ? (
            <p className={`md:col-span-2 xl:col-span-3 text-sm font-semibold ${message === "저장했습니다." ? "text-emerald-700" : "text-rose-700"}`} role="status">
              {message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function ProfileField({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600">
        {label}{hint ? <span className="font-medium text-slate-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>; }
function DataCard({ children, icon: Icon, subtitle, title }: { children: React.ReactNode; icon: typeof Truck; subtitle: string; title: string }) { return <section className="maju-section-card"><div className="maju-card-header flex items-center justify-between"><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-teal-700" /><h3 className="font-bold">{title}</h3></div><span className="text-xs font-semibold text-slate-500">{subtitle}</span></div><div className="divide-y border-t border-slate-100 px-4">{children}</div></section>; }
function Row({ left, right }: { left: string; right: string }) { return <div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="min-w-0 truncate text-slate-600">{left}</span><b className="shrink-0">{right}</b></div>; }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm font-semibold text-slate-500">{text}</div>; }
