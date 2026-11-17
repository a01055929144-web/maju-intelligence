"use client";

import { formatWon } from "@/domains/shared/money";
import { type FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { PartnerDirectory } from "@/components/partners/partner-directory";
import type { PartnerRow } from "@/domains/partner/directory";
import type { ProductSupplierDirectory, ProductSupplierSummary } from "@/lib/product-suppliers";

const money = (value: number) => formatWon(Math.round(value));
const date = (value?: string) => value ? new Date(value).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : "없음";
const businessNumber = (value?: string) => {
  const digits = (value || "").replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

export function ProductSupplierWorkspace({ companyId = "", data, loadError = "" }: { companyId?: string; data: ProductSupplierDirectory; loadError?: string }) {
  const [suppliers, setSuppliers] = useState(data.suppliers);
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
  // CC-73: 매출처와 같은 공용 거래처 틀(PartnerDirectory). 기존 기본정보 폼·상품 표·이력 표는 지우지 않고 틀의 탭 안으로 옮겼다.
  const rows = useMemo<Array<PartnerRow & { supplier: ProductSupplierSummary }>>(() => suppliers.map((supplier) => ({
    id: supplier.id, displayName: supplier.name, businessNumber: supplier.businessNumber, representativeName: supplier.representativeName,
    phone: supplier.contactPhone, lastTradeDate: supplier.latestImportAt ? date(supplier.latestImportAt) : undefined, status: supplier.isActive ? "활성" : "비활성", supplier
  })), [suppliers]);
  const tabs = useMemo(() => ({
    info: (row: PartnerRow & { supplier: ProductSupplierSummary }) => (
      <SupplierProfileCard companyId={companyId} key={row.id} onSaved={(saved) => setSuppliers((current) => current.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)))} supplier={row.supplier} />
    ),
    items: (row: PartnerRow & { supplier: ProductSupplierSummary }) => (
      <div className="space-y-4">
        <p className="text-xs font-semibold text-slate-500">{row.displayName} · 매입 상품 {row.supplier.productCount.toLocaleString()}개 · 원가 확정률 {row.supplier.confirmedCostRate}%</p>
        <CommonDataTable columns={productColumns} emptyMessage="조건에 맞는 매입 상품이 없습니다." filename="매입상품.csv" rowKey={(item) => item.id} rows={data.products.filter((item) => item.supplierId === row.id)} selectable={false} settingsKey="supplier-products" />
        <h4 className="text-sm font-black text-slate-900">원가 이력</h4>
        <CommonDataTable columns={historyColumns} emptyMessage="저장된 원가 이력이 없습니다." filename="원가이력.csv" rowKey={(item) => item.id} rows={data.costHistory.filter((item) => item.supplierId === row.id)} selectable={false} settingsKey="supplier-cost-history" />
      </div>
    ),
    memo: (row: PartnerRow & { supplier: ProductSupplierSummary }) => (
      <p className="whitespace-pre-wrap text-sm text-slate-700">{row.supplier.memo?.trim() || "메모가 없습니다."}<span className="mt-2 block text-xs text-slate-500">메모는 [기본 정보]에서 수정합니다.</span></p>
    )
  }), [companyId, data.costHistory, data.products, historyColumns, productColumns]);
  const extraTabs = useMemo(() => [{
    id: "imports", label: "업로드 이력",
    render: (row: PartnerRow) => <CommonDataTable columns={importColumns} emptyMessage="저장된 업로드 이력이 없습니다." filename="업로드이력.csv" rowKey={(item) => item.id} rows={data.imports.filter((item) => item.supplierId === row.id)} selectable={false} settingsKey="supplier-imports" />
  }], [data.imports, importColumns]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="활성 매입처" value={`${suppliers.filter((item) => item.isActive).length}곳`} />
        <Metric label="매입 상품" value={`${data.products.length.toLocaleString()}개`} />
        <Metric label="원가 비교 가능" value={`${data.comparisons.length.toLocaleString()}개 품목`} />
      </div>
      <PartnerDirectory companyId={companyId} extraTabs={extraTabs} loadError={loadError} partnerType="supplier" registerHref={uploadHref} rows={rows} tabs={tabs} uploadHref={uploadHref} />
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
