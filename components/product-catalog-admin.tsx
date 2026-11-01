"use client";
import { useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, PackagePlus, X } from "lucide-react";
import {
  CommonDataTable,
  type CommonTableColumn,
} from "@/components/common-data-table";
import {
  type ProductCatalogAdminItem,
  type ProductTaxType,
} from "@/lib/product-catalog-admin";
import { productCatalogMargin } from "@/lib/product-catalog-presentation";
const blank: ProductCatalogAdminItem = {
  id: "",
  name: "",
  purchaseUnit: "박스",
  salesUnit: "개",
  unit: "개",
  purchasePrice: 0,
  isActive: true,
  matchStatus: "matched",
  linkedSupplierCount: 0,
  hasUnconfirmedConversion: false,
  barcodes: [],
};
const money = (v?: number) =>
  v == null ? "-" : `${Math.round(v).toLocaleString("ko-KR")}원`;
const margin = productCatalogMargin;
type View = "all" | "recent" | "negative" | "no-price" | "no-code" | "duplicate-code" | "no-photo";
type SideTab = "category" | "supplier" | "maju-category";
export function ProductCatalogAdmin({
  categoriesEnabled = false,
  companyId = "",
  settingsKey = "products:current",
}: {
  categoriesEnabled?: boolean;
  companyId?: string;
  settingsKey?: string;
}) {
  const [items, setItems] = useState<ProductCatalogAdminItem[]>([]),
    [search, setSearch] = useState({ code: "", name: "", spec: "", unit: "", barcode: "" }),
    [tax, setTax] = useState<"all" | ProductTaxType>("all"),
    [active, setActive] = useState<"all" | "active" | "inactive">("active"),
    [mapped, setMapped] = useState<"all" | "mapped" | "unmapped">("all"),
    [view, setView] = useState<View>("all"),
    [sideTab, setSideTab] = useState<SideTab>("category"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<ProductCatalogAdminItem | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (companyId) p.set("companyId", companyId);
      const r = await fetch(`/api/product-catalog?${p}`, { cache: "no-store" }),
        j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setItems(j.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "품목을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(
    () => {
      const codeCounts = new Map<string, number>();
      for (const item of items) if (item.productCode) codeCounts.set(item.productCode, (codeCounts.get(item.productCode) || 0) + 1);
      const recentCutoff = Date.now() - 7 * 86400000;
      return items.filter((i) => {
        const spec = `${i.specValue || ""}${i.specUnit || ""} ${i.salesSpec || ""}`.toLowerCase();
        const matchesSearch =
          (!search.code || i.productCode?.toLowerCase().includes(search.code.toLowerCase())) &&
          (!search.name || `${i.name} ${i.managementName || ""}`.toLowerCase().includes(search.name.toLowerCase())) &&
          (!search.spec || spec.includes(search.spec.toLowerCase())) &&
          (!search.unit || `${i.salesUnit || ""} ${i.purchaseUnit}`.toLowerCase().includes(search.unit.toLowerCase())) &&
          (!search.barcode || (i.barcodes || []).some((x) => x.includes(search.barcode)));
        const matchesView =
          view === "all" ||
          (view === "recent" && Boolean(i.createdAt && Date.parse(i.createdAt) >= recentCutoff)) ||
          (view === "negative" && (margin(i) ?? 0) < 0) ||
          (view === "no-price" && i.salesPrice == null) ||
          (view === "no-code" && !i.productCode) ||
          (view === "duplicate-code" && Boolean(i.productCode && (codeCounts.get(i.productCode) || 0) > 1)) ||
          (view === "no-photo" && !i.photoUrl);
        return matchesSearch && matchesView &&
          (tax === "all" || i.taxType === tax) &&
          (active === "all" || (active === "active") === i.isActive) &&
          (mapped === "all" ||
            (mapped === "mapped") === i.linkedSupplierCount > 0);
      });
    },
    [items, search, tax, active, mapped, view],
  );
  const sideItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const names = sideTab === "category"
        ? [item.category || "미분류"]
        : sideTab === "supplier"
          ? item.supplierNames?.length ? item.supplierNames : ["매입처 없음"]
          : ["공통 카테고리 미연결"];
      for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [items, sideTab]);
  const columns = useMemo<CommonTableColumn<ProductCatalogAdminItem>[]>(() => [
    { key: "code", label: "ERP 코드", width: 90, value: (i) => i.productCode || "-" },
    { key: "name", label: "상품명 / 관리명", width: 150, value: (i) => `${i.name} ${i.managementName || ""}`, render: (i) => <button className="text-left font-bold hover:text-teal-700" onClick={() => setEditing(i)} type="button">{i.name}<span className="block text-xs font-normal text-slate-500">{i.managementName || "-"}</span></button> },
    { key: "spec", label: "규격", width: 75, value: (i) => i.spec || "-" },
    { key: "unit", label: "단위", width: 60, value: (i) => i.salesUnit || i.unit },
    { key: "supplier", label: "매입처", width: 110, value: (i) => i.supplierNames?.join(", ") || "매입처 없음" },
    { key: "stockMode", label: "재고 방식", width: 75, value: (i) => i.trackingEnabled == null ? "미설정" : i.trackingEnabled ? "재고" : "사입" },
    { key: "purchase", label: "매입가", align: "right", width: 90, value: (i) => i.purchasePrice, render: (i) => i.hasUnconfirmedConversion ? <span className="text-amber-700">환산 미확인</span> : money(i.purchasePrice) },
    { key: "margin", label: "마진", align: "right", width: 65, value: (i) => margin(i), render: (i) => margin(i) == null ? "-" : <span className={(margin(i) || 0) < 0 ? "font-black text-rose-700" : ""}>{margin(i)!.toFixed(1)}%</span> },
    { key: "sales", label: "판매가", align: "right", width: 90, value: (i) => i.salesPrice, render: (i) => <span className={(margin(i) || 0) < 0 ? "font-black text-rose-700" : ""}>{money(i.salesPrice)}</span> },
    { key: "stock", label: "재고", align: "right", width: 60, value: (i) => i.onHand, render: (i) => i.onHand?.toLocaleString("ko-KR") || "-" },
    { key: "status", label: "상태", width: 65, value: (i) => i.isActive ? "판매중" : "중지" },
    { key: "barcode", label: "바코드", defaultHidden: true, width: 150, value: (i) => i.barcodes?.join(", ") || "-" },
    { key: "tax", label: "과세", defaultHidden: true, width: 80, value: (i) => i.taxType === "taxable" ? "과세" : i.taxType === "exempt" ? "면세" : "미정" },
    { key: "storage", label: "보관", defaultHidden: true, width: 80, value: () => "미설정" },
    { key: "brand", label: "브랜드", defaultHidden: true, width: 120, value: (i) => i.brand || "-" },
    { key: "edit", label: "수정", defaultHidden: true, sortable: false, width: 60, value: () => "", render: (i) => <button aria-label={`${i.name} 편집`} className="maju-button-secondary" onClick={() => setEditing(i)} type="button"><Edit3 className="h-4 w-4" /></button> },
  ], []);
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="maju-section-card self-start overflow-hidden lg:sticky lg:top-4">
        <div className={`grid border-b p-2 ${categoriesEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
          <button className={`rounded-lg px-3 py-2 text-sm font-bold ${sideTab === "category" ? "bg-teal-700 text-white" : "text-slate-600"}`} onClick={() => setSideTab("category")} type="button">구분</button>
          <button className={`rounded-lg px-3 py-2 text-sm font-bold ${sideTab === "supplier" ? "bg-teal-700 text-white" : "text-slate-600"}`} onClick={() => setSideTab("supplier")} type="button">매입처</button>
          {categoriesEnabled ? <button className={`rounded-lg px-2 py-2 text-xs font-bold ${sideTab === "maju-category" ? "bg-teal-700 text-white" : "text-slate-600"}`} onClick={() => setSideTab("maju-category")} type="button">마주 공통 카테고리</button> : null}
        </div>
        {sideTab === "category" && !categoriesEnabled ? <p className="border-b bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">트리 편집 OFF · SQL 승인 대기</p> : null}
        {sideTab === "maju-category" ? <p className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">CategoryMatch 연결 전 상품은 미연결로 모아 봅니다. 연결 편집은 SQL 승인 후 제공합니다.</p> : null}
        <div className="max-h-[70vh] overflow-y-auto p-2">{sideItems.map((item) => <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50" key={item.name}><span className="truncate font-semibold">{item.name}</span><span className="text-xs text-slate-500">{item.count}</span></div>)}</div>
      </aside>
      <div className="min-w-0 space-y-4">
      <section className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
              <h2 className="maju-section-title">상품관리</h2>
            <p className="mt-1 maju-muted-label">
              판매 단위와 공급 상품의 원가·환산을 한 곳에서 관리합니다.
            </p>
          </div>
          <button
            className="maju-button-primary inline-flex items-center gap-2"
            onClick={() => setEditing({ ...blank })}
          >
            <PackagePlus className="h-4 w-4" />
            상품 등록
          </button>
        </div>
        <div className="grid gap-2 border-b p-4 sm:grid-cols-2 xl:grid-cols-5">
          {([['code','ERP 코드'],['name','상품명'],['spec','규격'],['unit','단위'],['barcode','바코드']] as const).map(([key, label]) => <input aria-label={`${label} 검색`} className="maju-input w-full" key={key} onChange={(e) => setSearch((value) => ({ ...value, [key]: e.target.value }))} placeholder={`${label} 검색`} value={search[key]} />)}
        </div>
        <div className="flex flex-wrap gap-2 border-b p-4">
          {([['all','전체'],['recent','방금 추가'],['negative','역마진'],['no-price','판매가 없음'],['no-code','ERP 코드 없음'],['duplicate-code','ERP 코드 중복'],['no-photo','사진 없음']] as Array<[View,string]>).map(([key, label]) => <button className={`rounded-full border px-3 py-1.5 text-xs font-bold ${view === key ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}
          <Filter
            value={tax}
            onChange={(v) => setTax(v as typeof tax)}
            options={[
              ["all", "전체 과세"],
              ["taxable", "과세"],
              ["exempt", "면세"],
            ]}
          />
          <Filter
            value={active}
            onChange={(v) => setActive(v as typeof active)}
            options={[
              ["all", "전체 상태"],
              ["active", "판매중"],
              ["inactive", "판매중지"],
            ]}
          />
          <Filter
            value={mapped}
            onChange={(v) => setMapped(v as typeof mapped)}
            options={[
              ["all", "전체 매핑"],
              ["mapped", "공급 연결"],
              ["unmapped", "미연결"],
            ]}
          />
        </div>
        {error ? (
          <p className="p-4 text-sm font-semibold text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="flex items-center justify-center gap-2 p-12">
            <Loader2 className="h-5 w-5 animate-spin" />
            품목을 불러오는 중입니다.
          </p>
        ) : null}
        {!loading ? (
          <CommonDataTable columns={columns} emptyMessage="조건에 맞는 상품이 없습니다." filename="상품관리.csv" groupBy={(item) => ({ key: item.category || "uncategorized", label: item.category || "미분류" })} rowKey={(item) => item.id} rows={shown} settingsKey={settingsKey} />
        ) : null}
      </section>
      {editing ? (
        <Editor
          companyId={companyId}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, keepOpen) => {
            setItems((cur) =>
              saved.id && cur.some((i) => i.id === saved.id)
                ? cur.map((i) => (i.id === saved.id ? saved : i))
                : [saved, ...cur],
            );
            setEditing(keepOpen ? { ...blank } : null);
          }}
        />
      ) : null}
      </div>
    </div>
  );
}
function Filter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      className="maju-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
function Editor({
  companyId,
  item,
  onClose,
  onSaved,
}: {
  companyId: string;
  item: ProductCatalogAdminItem;
  onClose: () => void;
  onSaved: (i: ProductCatalogAdminItem, keepOpen: boolean) => void;
}) {
  const [d, setD] = useState(item),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const put = (k: keyof ProductCatalogAdminItem, v: unknown) =>
    setD((x) => ({ ...x, [k]: v }));
  async function save(keepOpen: boolean) {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/product-catalog", {
          method: d.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...d, companyId }),
        }),
        j = await r.json();
      if (!r.ok || !j.item) throw new Error(j.message);
      onSaved(j.item, keepOpen);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-0 sm:p-4">
      <form
        aria-labelledby="product-editor-title"
        aria-modal="true"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:max-w-[920px] sm:rounded-2xl"
        role="dialog"
        onKeyDown={(event) => {
          if (event.ctrlKey && event.key === "Enter") {
            event.preventDefault();
            void save(false);
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-black" id="product-editor-title">
              {d.id ? "상품 편집" : "상품 등록"}
            </h2>
            {d.productCode ? (
              <p className="font-mono text-xs text-slate-500">
                {d.productCode} · 변경 불가
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                저장 시 품목코드가 자동 발급됩니다.
              </p>
            )}
          </div>
          <button aria-label="상품 편집 닫기" type="button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-4">
          <h3 className="border-b pb-2 text-sm font-black text-slate-800 sm:col-span-2 lg:col-span-4">기본</h3>
          <Field label="노출명 *">
            <input
              className="maju-input w-full"
              required
              value={d.name}
              onChange={(e) => put("name", e.target.value)}
            />
          </Field>
          <Field label="관리명">
            <input className="maju-input w-full" value={d.managementName || ""} onChange={(e) => put("managementName", e.target.value)} />
          </Field>
          <Field label="ERP 코드 (자동)">
            <input className="maju-input w-full" disabled placeholder="저장 시 자동 발급" value={d.productCode || ""} />
          </Field>
          <Field label="바코드">
            <input className="maju-input w-full" value={d.barcodes?.[0] || ""} onChange={(e) => put("barcodes", e.target.value ? [e.target.value] : [])} />
          </Field>
          <h3 className="mt-2 border-b pb-2 text-sm font-black text-slate-800 sm:col-span-2 lg:col-span-4">분류 · 매입처 · 보관</h3>
          <Field label="분류">
            <input
              className="maju-input w-full"
              value={d.category || ""}
              onChange={(e) => put("category", e.target.value)}
            />
          </Field>
          <Field label="브랜드">
            <input
              className="maju-input w-full"
              value={d.brand || ""}
              onChange={(e) => put("brand", e.target.value)}
            />
          </Field>
          <Field label="원산지">
            <input
              className="maju-input w-full"
              value={d.origin || ""}
              onChange={(e) => put("origin", e.target.value)}
            />
          </Field>
          <Field label="규격">
            <div className="flex gap-2">
              <input
                className="maju-input min-w-0 flex-1"
                min="0"
                type="number"
                value={d.specValue ?? ""}
                onChange={(e) =>
                  put(
                    "specValue",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
              <input
                className="maju-input w-24"
                placeholder="g/ml"
                value={d.specUnit || ""}
                onChange={(e) => put("specUnit", e.target.value)}
              />
            </div>
          </Field>
          <Field label="과세구분">
            <select
              className="maju-input w-full"
              value={d.taxType || ""}
              onChange={(e) => put("taxType", e.target.value || undefined)}
            >
              <option value="">미정</option>
              <option value="taxable">과세</option>
              <option value="exempt">면세</option>
            </select>
          </Field>
          <Field label="매입 단위">
            <input
              className="maju-input w-full"
              required
              value={d.purchaseUnit}
              onChange={(e) => put("purchaseUnit", e.target.value)}
            />
          </Field>
          <Field label="판매 단위">
            <input
              className="maju-input w-full"
              required
              value={d.salesUnit || ""}
              onChange={(e) => put("salesUnit", e.target.value)}
            />
          </Field>
          <Field label="환산 비율 (매입 1단위 = 판매 N단위)">
            <input
              className="maju-input w-full"
              min="0.0001"
              step="any"
              type="number"
              value={d.purchaseToSalesRatio ?? ""}
              onChange={(e) =>
                put(
                  "purchaseToSalesRatio",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            />
          </Field>
          <h3 className="mt-2 border-b pb-2 text-sm font-black text-slate-800 sm:col-span-2 lg:col-span-4">가격</h3>
          <Field label="매입가 *">
            <input className="maju-input w-full" min="0" required type="number" value={d.purchasePrice} onChange={(e) => put("purchasePrice", Number(e.target.value) || 0)} />
          </Field>
          <Field label="판매가">
            <input
              className="maju-input w-full"
              min="0"
              type="number"
              value={d.salesPrice ?? ""}
              onChange={(e) =>
                put(
                  "salesPrice",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            />
          </Field>
          <div className="rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700">
            계산 마진 · {margin(d) == null ? "판매가를 입력해 주세요" : `${margin(d)!.toFixed(1)}%`}
          </div>
          <Field label="사진 URL">
            <input
              className="maju-input w-full"
              value={d.photoUrl || ""}
              onChange={(e) => put("photoUrl", e.target.value)}
            />
          </Field>
          <Field label="판매 상태">
            <select
              className="maju-input w-full"
              value={d.isActive ? "active" : "inactive"}
              onChange={(e) => put("isActive", e.target.value === "active")}
            >
              <option value="active">판매중</option>
              <option value="inactive">판매중지</option>
            </select>
          </Field>
          {error ? (
            <p className="text-sm font-semibold text-rose-700 sm:col-span-2 lg:col-span-4" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t bg-white p-4">
          <button
            className="maju-button-secondary"
            type="button"
            onClick={onClose}
          >
            취소
          </button>
          {!d.id ? <button className="maju-button-secondary" disabled={saving} onClick={(event) => { event.preventDefault(); void save(true); }} type="button">저장하고 새로</button> : null}
          <button className="maju-button-primary" disabled={saving} title="Ctrl+Enter">
            {saving ? "저장 중…" : "저장"}
          </button>
        </footer>
      </form>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
