"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, PackagePlus, Search, X } from "lucide-react";
import type {
  ProductCatalogAdminItem,
  ProductTaxType,
} from "@/lib/product-catalog-admin";
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
};
const money = (v?: number) =>
  v == null ? "-" : `${Math.round(v).toLocaleString("ko-KR")}원`;
export function ProductCatalogAdmin({
  companyId = "",
}: {
  companyId?: string;
}) {
  const [items, setItems] = useState<ProductCatalogAdminItem[]>([]),
    [query, setQuery] = useState(""),
    [tax, setTax] = useState<"all" | ProductTaxType>("all"),
    [active, setActive] = useState<"all" | "active" | "inactive">("active"),
    [mapped, setMapped] = useState<"all" | "mapped" | "unmapped">("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<ProductCatalogAdminItem | null>(null);
  async function load(q = "") {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
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
    () =>
      items.filter(
        (i) =>
          (tax === "all" || i.taxType === tax) &&
          (active === "all" || (active === "active") === i.isActive) &&
          (mapped === "all" ||
            (mapped === "mapped") === i.linkedSupplierCount > 0),
      ),
    [items, tax, active, mapped],
  );
  return (
    <div className="space-y-4">
      <section className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="maju-section-title">표준 품목</h2>
            <p className="mt-1 maju-muted-label">
              판매 단위와 공급 상품의 원가·환산을 한 곳에서 관리합니다.
            </p>
          </div>
          <button
            className="maju-button-primary inline-flex items-center gap-2"
            onClick={() => setEditing({ ...blank })}
          >
            <PackagePlus className="h-4 w-4" />
            품목 추가
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-b p-4">
          <form
            className="relative min-w-64 flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              void load(query);
            }}
          >
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="품목 검색"
              className="maju-input w-full pl-9"
              placeholder="품목코드·품목명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">품목코드</th>
                  <th>품목명</th>
                  <th>규격</th>
                  <th>판매 단위</th>
                  <th>과세</th>
                  <th>공급 연결</th>
                  <th>최저 환산 원가</th>
                  <th>상태</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      {i.productCode || "-"}
                    </td>
                    <td className="font-bold">
                      {i.name}
                      <p className="text-xs font-normal text-slate-500">
                        {[i.brand, i.origin].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td>
                      {i.specValue ? `${i.specValue}${i.specUnit || ""}` : "-"}
                    </td>
                    <td>{i.salesUnit || "-"}</td>
                    <td>
                      {i.taxType === "taxable"
                        ? "과세"
                        : i.taxType === "exempt"
                          ? "면세"
                          : "미정"}
                    </td>
                    <td>{i.linkedSupplierCount}개</td>
                    <td>
                      {i.hasUnconfirmedConversion ? (
                        <span className="text-amber-700">환산 미확인</span>
                      ) : (
                        money(i.minimumUnitCost)
                      )}
                    </td>
                    <td>{i.isActive ? "판매중" : "중지"}</td>
                    <td className="pr-4 text-right">
                      <button
                        aria-label={`${i.name} 편집`}
                        className="maju-button-secondary"
                        onClick={() => setEditing(i)}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {editing ? (
        <Editor
          companyId={companyId}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((cur) =>
              saved.id && cur.some((i) => i.id === saved.id)
                ? cur.map((i) => (i.id === saved.id ? saved : i))
                : [saved, ...cur],
            );
            setEditing(null);
          }}
        />
      ) : null}
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
  onSaved: (i: ProductCatalogAdminItem) => void;
}) {
  const [d, setD] = useState(item),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const put = (k: keyof ProductCatalogAdminItem, v: unknown) =>
    setD((x) => ({ ...x, [k]: v }));
  async function save(e: FormEvent) {
    e.preventDefault();
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
      onSaved(j.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <form
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white"
        onSubmit={save}
      >
        <header className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-black">
              {d.id ? "표준 품목 편집" : "표준 품목 추가"}
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
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="품목명">
            <input
              className="maju-input w-full"
              required
              value={d.name}
              onChange={(e) => put("name", e.target.value)}
            />
          </Field>
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
            <p className="sm:col-span-2 text-sm font-semibold text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex justify-end gap-2 border-t p-4">
          <button
            className="maju-button-secondary"
            type="button"
            onClick={onClose}
          >
            취소
          </button>
          <button className="maju-button-primary" disabled={saving}>
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
