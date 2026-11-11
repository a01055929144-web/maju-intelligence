"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Save, Search } from "lucide-react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { ErpPartnerDirectoryToolbar } from "@/components/erp-partner-directory-toolbar";
import type { ProductSupplierDirectory, ProductSupplierSummary } from "@/lib/product-suppliers";

const money = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const date = (value?: string) => value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음";
const businessNumber = (value?: string) => {
  const digits = (value || "").replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

type SupplierTab = "list" | "products" | "history";
const SUPPLIER_TABS: ReadonlyArray<readonly [SupplierTab, string]> = [["list", "매입처 목록"], ["products", "매입 상품"], ["history", "거래내역"]];

export function ProductSupplierWorkspace({ companyId = "", data, loadError = "" }: { companyId?: string; data: ProductSupplierDirectory; loadError?: string }) {
  const [suppliers, setSuppliers] = useState(data.suppliers);
  const [selectedId, setSelectedId] = useState(data.suppliers[0]?.id || "");
  const [tab, setTab] = useState<SupplierTab>("list");
  const [supplierQuery, setSupplierQuery] = useState("");
  const selected = suppliers.find((supplier) => supplier.id === selectedId);
  const products = useMemo(() => data.products.filter((item) => item.supplierId === selectedId), [data.products, selectedId]);
  const visibleSuppliers = useMemo(() => {
    const normalized = supplierQuery.trim().toLocaleLowerCase("ko");
    return normalized ? suppliers.filter((supplier) => supplier.name.toLocaleLowerCase("ko").includes(normalized)) : suppliers;
  }, [supplierQuery, suppliers]);
  const history = useMemo(() => data.costHistory.filter((item) => item.supplierId === selectedId), [data.costHistory, selectedId]);
  const imports = useMemo(() => data.imports.filter((item) => item.supplierId === selectedId), [data.imports, selectedId]);
  const uploadHref = companyId ? `/revenue/pricing?companyId=${encodeURIComponent(companyId)}` : "/revenue/pricing"; // 매입처 가격 파일은 매입가 반영에서 올린다(2149)
  const productColumns = useMemo<CommonTableColumn<ProductSupplierDirectory["products"][number]>[]>(() => [
    { key: "name", label: "매입 상품", value: (row) => row.rawName, sortable: true },
    { key: "spec", label: "규격·단위", value: (row) => `${row.rawSpec || "-"} · ${row.rawUnit || "-"}` },
    { key: "cost", label: "최신 원가", value: (row) => row.latestCost ?? "", render: (row) => (row.latestCost == null ? "-" : money(row.latestCost)), align: "right", sortable: true },
    { key: "status", label: "원가 상태", value: (row) => (row.costConfirmed ? "확정" : "확인 필요"), render: (row) => (row.costConfirmed ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />확정</span> : <span className="font-bold text-amber-700">확인 필요</span>) },
    { key: "matched", label: "연결 마스터 상품", value: (row) => row.matchedCatalogName || "미연결", render: (row) => row.matchedCatalogName || <span className="text-slate-400">미연결</span> },
    { key: "seen", label: "관측일", value: (row) => row.lastSeenDate || "", render: (row) => date(row.lastSeenDate), sortable: true },
  ], []);
  const historyColumns = useMemo<CommonTableColumn<ProductSupplierDirectory["costHistory"][number]>[]>(() => [
    { key: "date", label: "날짜", value: (row) => row.priceDate, sortable: true },
    { key: "name", label: "상품", value: (row) => row.productName, sortable: true },
    { key: "price", label: "원가", value: (row) => row.purchasePrice, render: (row) => money(row.purchasePrice), align: "right", sortable: true },
  ], []);
  const importColumns = useMemo<CommonTableColumn<ProductSupplierDirectory["imports"][number]>[]>(() => [
    { key: "date", label: "업로드일", value: (row) => row.completedAt || row.createdAt, render: (row) => date(row.completedAt || row.createdAt), sortable: true },
    { key: "file", label: "파일", value: (row) => row.fileName },
    { key: "status", label: "상태", value: (row) => row.status },
    { key: "rows", label: "행 수", value: (row) => row.totalRows, render: (row) => row.totalRows.toLocaleString(), align: "right", sortable: true },
  ], []);
  const supplierPicker = (
    <label className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
      매입처
      <select aria-label="매입처 선택" className="maju-input min-h-11 sm:min-h-9" onChange={(event) => setSelectedId(event.target.value)} value={selectedId}>
        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="활성 매입처" value={`${suppliers.filter((item) => item.isActive).length}곳`} />
        <Metric label="매입 상품" value={`${data.products.length.toLocaleString()}개`} />
        <Metric label="원가 비교 가능" value={`${data.comparisons.length.toLocaleString()}개 품목`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div aria-label="매입처 화면" className="flex max-w-full gap-1 overflow-x-auto" role="tablist">
          {SUPPLIER_TABS.map(([id, label]) => (
            <button aria-selected={tab === id} className={`shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${tab === id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`} key={id} onClick={() => setTab(id)} role="tab" type="button">{label}</button>
          ))}
        </div>
        <Link className="maju-button-primary min-h-11 px-3 text-xs sm:min-h-9" href={uploadHref}><FileSpreadsheet className="h-4 w-4" /> 단가표 업로드</Link>
      </div>

      {tab === "list" ? (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          <aside className="maju-section-card overflow-hidden">
            <ErpPartnerDirectoryToolbar
              countLabel={`${visibleSuppliers.length}/${suppliers.length}곳`}
              description="매입처를 검색한 뒤 상품 수, 원가 확정률, 최근 업로드와 활성 상태를 비교하세요."
              error={loadError || undefined}
              onRetry={loadError ? () => window.location.reload() : undefined}
              title="매입처 목록"
            >
              <label className="maju-search-field max-w-xl">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  aria-label="매입처 검색"
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
                  onChange={(event) => setSupplierQuery(event.target.value)}
                  placeholder="매입처명 검색"
                  value={supplierQuery}
                />
              </label>
            </ErpPartnerDirectoryToolbar>
            {visibleSuppliers.length ? (
              <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
                {visibleSuppliers.map((supplier) => (
                  <button
                    aria-pressed={selectedId === supplier.id}
                    className={`min-h-24 w-full px-4 py-3 text-left transition ${selectedId === supplier.id ? "bg-teal-50 ring-1 ring-inset ring-teal-200" : "bg-white hover:bg-slate-50"}`}
                    key={supplier.id}
                    onClick={() => setSelectedId(supplier.id)}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <b className="min-w-0 break-words text-sm text-slate-950">{supplier.name}</b>
                      <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${supplier.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{supplier.isActive ? "활성" : "비활성"}</span>
                    </span>
                    <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-semibold text-slate-600">
                      <span>상품 {supplier.productCount.toLocaleString()}개</span>
                      <span>원가 확정률 {supplier.confirmedCostRate}%</span>
                      <span className="col-span-2 font-medium text-slate-500">최근 업로드 {date(supplier.latestImportAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : loadError ? null : (
              <div className="maju-empty-state m-4">
                <p className="text-sm font-black text-slate-700">{suppliers.length ? "검색 조건에 맞는 매입처가 없습니다." : "등록된 매입처가 없습니다."}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-400">{suppliers.length ? "검색어를 바꿔보세요." : "매입 단가표를 업로드하면 매입처가 생성됩니다."}</p>
                {suppliers.length ? <button className="maju-button-secondary mt-3 min-h-11" onClick={() => setSupplierQuery("")} type="button">검색 초기화</button> : <Link className="maju-button-primary mt-3 min-h-11" href={uploadHref}>단가표 업로드</Link>}
              </div>
            )}
          </aside>
          <div className="min-w-0 space-y-4">
            {selected ? (
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
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "products" ? (
        <>
          <section className="maju-section-card">
            <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="maju-section-title">매입 상품</h2><p className="mt-1 maju-muted-label">{selected ? `${selected.name} · 상품 ${selected.productCount.toLocaleString()}개 · 최근 업로드 ${date(selected.latestImportAt)}` : "매입처를 고르세요."}</p></div>
              {supplierPicker}
            </div>
            <div className="border-t border-slate-100 p-4">
              <CommonDataTable columns={productColumns} emptyMessage="조건에 맞는 매입 상품이 없습니다." filename="매입상품.csv" rowKey={(row) => row.id} rows={products} settingsKey="supplier-products" />
            </div>
          </section>
          <section className="maju-section-card">
            <div className="maju-card-header"><h2 className="maju-section-title">같은 마스터 상품의 매입처별 원가 비교</h2><p className="mt-1 maju-muted-label">현재 회사가 보유한 확정 원가만 비교합니다. 다른 회사 데이터는 포함하지 않습니다.</p></div>
            <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">{data.comparisons.slice(0, 20).map((comparison) => <div className="rounded-xl border border-slate-200 p-4" key={comparison.catalogId}><b>{comparison.catalogName}</b><div className="mt-3 space-y-2">{comparison.offers.toSorted((a, b) => a.cost - b.cost).map((offer) => <div className="flex items-center justify-between gap-3 text-sm" key={`${comparison.catalogId}-${offer.supplierId}`}><span className="text-slate-600">{offer.supplierName}</span><span className="font-bold">{money(offer.cost)}</span></div>)}</div></div>)}</div>
            {!data.comparisons.length ? <Empty text="두 곳 이상의 매입처에 연결된 확정 원가가 아직 없습니다." /> : null}
          </section>
        </>
      ) : null}

      {tab === "history" ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          <section className="maju-section-card">
            <div className="maju-card-header flex flex-wrap items-center justify-between gap-3"><h2 className="maju-section-title">원가 이력</h2>{supplierPicker}</div>
            <div className="border-t border-slate-100 p-4"><CommonDataTable columns={historyColumns} emptyMessage="저장된 원가 이력이 없습니다." filename="원가이력.csv" rowKey={(row) => row.id} rows={history} settingsKey="supplier-cost-history" /></div>
          </section>
          <section className="maju-section-card">
            <div className="maju-card-header"><h2 className="maju-section-title">업로드 이력</h2><p className="mt-1 maju-muted-label">{imports.length}건</p></div>
            <div className="border-t border-slate-100 p-4"><CommonDataTable columns={importColumns} emptyMessage="저장된 업로드 이력이 없습니다." filename="업로드이력.csv" rowKey={(row) => row.id} rows={imports} settingsKey="supplier-imports" /></div>
          </section>
        </div>
      ) : null}
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
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm font-semibold text-slate-500">{text}</div>; }
