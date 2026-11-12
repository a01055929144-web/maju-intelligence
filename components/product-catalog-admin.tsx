"use client";
import { useEffect, useMemo, useState } from "react";
import { compareCategoryPath, toFolderOrder, type FolderOrder } from "@/domains/pricing/category-tree";
import { categoryAncestors, categoryLevelOptions, isUnder, joinCategory, splitCategory, suggestCategory } from "@/domains/pricing/product-category";
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
type View = "all" | "recent" | "negative" | "no-price" | "no-code" | "duplicate-code" | "no-photo" | "promo" | "soon" | "no-promo";
type SideTab = "category" | "supplier" | "maju-category";
const units = ["박스", "kg", "g", "개", "단", "봉", "판", "통"];
const origins = ["국내산", "중국산", "미국산", "호주산", "수입산"];
export function ProductCatalogAdmin({
  categoriesEnabled = false,
  canManageCategories = false,
  companyId = "",
  settingsKey = "products:current",
}: {
  categoriesEnabled?: boolean;
  canManageCategories?: boolean;
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
    [sideFilter, setSideFilter] = useState(""),
    [sideOpen, setSideOpen] = useState<Set<string>>(new Set()),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<ProductCatalogAdminItem | null>(null),
    [reviewingCategories, setReviewingCategories] = useState(false),
    // CC-26: 폴더 순서(모든 분류 화면 공통). 읽지 못하면 이름순.
    [folderOrder, setFolderOrder] = useState<FolderOrder>(new Map());
  useEffect(() => {
    void fetch(`/api/price-sheets/folder-order${companyId ? `?${new URLSearchParams({ companyId })}` : ""}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { folders: [] }))
      .then((body: { folders?: Array<{ path: string; sortOrder: number }> }) => setFolderOrder(toFolderOrder(body.folders ?? [])))
      .catch(() => setFolderOrder(new Map()));
  }, [companyId]);
  // CC-26: 폴더를 다른 폴더로 끌어 놓으면 그 안으로 옮긴다(CC-17 폴더 이동 API — 상품·마진 연결이 한 번에, 같은 경로가 있으면 대상 마진 유지, 끝나면 판매가 재계산).
  const [dragFolder, setDragFolder] = useState<string | null>(null),
    [picked, setPicked] = useState<Set<string>>(new Set()), // CC-24: 줄 선택 → 삭제(안 쓴 상품은 완전 삭제, 쓴 상품은 숨김)·되살리기
    [dragProduct, setDragProduct] = useState<ProductCatalogAdminItem | null>(null), // CC-26: 표의 상품을 트리 폴더로 끌어 분류 변경
    [dropTarget, setDropTarget] = useState<string | null>(null),
    [moveMessage, setMoveMessage] = useState("");
  // CC-26: ▲▼로 같은 상위 폴더 안에서 순서를 바꾼다(DB 함수가 형제 순서를 다시 매김). 순서만 바뀌므로 판매가 재계산은 필요 없다.
  async function reorderFolder(path: string, direction: -1 | 1) {
    const parent = splitCategory(path).slice(0, -1).join(" > ");
    const siblings = sideItems.filter((x) => x.name !== "미분류" && x.depth === splitCategory(path).length - 1 && splitCategory(x.name).slice(0, -1).join(" > ") === parent).map((x) => x.name);
    const index = siblings.indexOf(path), target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    // 위로: 위 형제 앞. 아래로: 아래 형제의 다음 형제 앞(없으면 맨 끝).
    const before = direction === -1 ? siblings[target] : siblings[target + 1] ?? "";
    setError(""); setMoveMessage("");
    try {
      const response = await fetch("/api/price-sheets/reorder-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, path, before }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "순서를 바꾸지 못했습니다.");
      const order = await fetch(`/api/price-sheets/folder-order${companyId ? `?${new URLSearchParams({ companyId })}` : ""}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { folders: [] }));
      setFolderOrder(toFolderOrder(order.folders ?? []));
    } catch (e) { setError(e instanceof Error ? e.message : "순서를 바꾸지 못했습니다."); }
  }
  const canDrop = (from: string | null, target: string) => Boolean(from) && from !== target && !isUnder(target, from as string) && splitCategory(`${target} > x`).length <= 3 && splitCategory(from as string).slice(0, -1).join(" > ") !== target;
  const canMoveProduct = (product: ProductCatalogAdminItem | null, target: string) => Boolean(product) && canManageCategories && target !== "미분류" && (product!.category || "미분류") !== target;
  async function moveProduct(product: ProductCatalogAdminItem, target: string) {
    setError(""); setMoveMessage("");
    try {
      const response = await fetch("/api/product-catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-categories", companyId, updates: [{ id: product.id, category: target, expectedCategory: product.category }] }) });
      const body = await response.json().catch(() => ({})) as { message?: string; results?: Array<{ ok: boolean; message?: string }> };
      const result = body.results?.[0];
      if (!response.ok || !result?.ok) throw new Error(result?.message || body.message || "분류를 바꾸지 못했습니다.");
      setItems((current) => current.map((item) => (item.id === product.id ? { ...item, category: target } : item)));
      // 분류가 바뀌면 이어받는 마진이 달라질 수 있어 폴더 옮기기와 같이 판매가를 다시 계산한다(실패해도 분류 변경은 유지).
      const recalc = await fetch(`/api/price-sheets${companyId ? `?${new URLSearchParams({ companyId })}` : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recalculate" }) });
      setMoveMessage(`"${product.name}"을(를) "${target}"(으)로 옮겼습니다.${recalc.ok ? " 판매가를 다시 계산했습니다." : " 판매가 재계산은 가격 관리에서 다시 해 주세요."}`);
    } catch (e) { setError(e instanceof Error ? e.message : "분류를 바꾸지 못했습니다."); }
  }
  const pickedItems = items.filter((item) => picked.has(item.id));
  async function productAction(body: Record<string, unknown>) {
    const response = await fetch("/api/product-catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ids: pickedItems.map((item) => item.id), ...body }) });
    const result = await response.json().catch(() => ({})) as { message?: string; found?: number; deletable?: number; hideOnly?: number; restored?: number };
    if (!response.ok) throw new Error(result.message || "상품을 처리하지 못했습니다.");
    return result;
  }
  async function deletePicked() {
    setError(""); setMoveMessage("");
    try {
      const count = await productAction({ action: "delete-products", apply: false }); // 먼저 숫자만 센다
      const deletable = count.deletable ?? 0, hideOnly = count.hideOnly ?? 0;
      if (!window.confirm(`${deletable}개 완전 삭제 · ${hideOnly}개 숨김\n\n완전 삭제는 되돌릴 수 없습니다(매입가·마진·행사 연결도 함께 지워짐). 주문·문서·재고·계약 단가에 쓰인 상품은 지우지 않고 숨기며, 판매중지 필터에서 되살릴 수 있습니다. 이미 발행한 문서는 그대로입니다.\n\n진행할까요?`)) return;
      const done = await productAction({ action: "delete-products", apply: true });
      setMoveMessage(`${done.deletable ?? 0}개를 완전 삭제하고 ${done.hideOnly ?? 0}개를 숨겼습니다.`);
      setPicked(new Set());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "상품을 처리하지 못했습니다."); }
  }
  async function restorePicked() {
    setError(""); setMoveMessage("");
    try {
      const done = await productAction({ action: "restore-products" });
      setMoveMessage(`${done.restored ?? 0}개를 되살렸습니다.`);
      setPicked(new Set());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "상품을 처리하지 못했습니다."); }
  }
  async function moveFolder(from: string, target: string) {
    const to = `${target} > ${splitCategory(from).slice(-1)[0]}`;
    if (!window.confirm(`"${from}" 폴더를 "${target}" 안으로 옮길까요?\n하위 폴더와 상품 분류가 함께 바뀌고, 같은 경로가 이미 있으면 대상 폴더의 마진 연결을 유지합니다.\n옮긴 뒤 판매가를 바로 다시 계산합니다.`)) return;
    setError(""); setMoveMessage("");
    try {
      const response = await fetch("/api/price-sheets/move-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from, to }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "폴더를 옮기지 못했습니다.");
      const recalc = await fetch(`/api/price-sheets${companyId ? `?${new URLSearchParams({ companyId })}` : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recalculate" }) });
      setMoveMessage(`"${from}"을(를) "${to}"(으)로 옮겼습니다(상품 ${Number(body.productCount || 0)}개).${recalc.ok ? " 판매가를 다시 계산했습니다." : " 판매가 재계산은 마진 설정에서 다시 해 주세요."}`);
      setSideFilter("");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "폴더를 옮기지 못했습니다."); }
  }
  // 매입가 업로드 완료 안내의 "미분류 상품 보기" 링크(?category=unsorted)로 들어오면 미분류만 보여 준다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("category") === "unsorted") { setSideTab("category"); setSideFilter("미분류"); }
  }, []);
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
          (view === "no-photo" && !i.photoUrl) ||
          (view === "promo" && i.promotion?.badge === "행사") ||
          (view === "soon" && i.promotion?.badge === "임박") ||
          (view === "no-promo" && !i.promotion);
        // 11/5: 왼쪽 분류·매입처를 누르면 그 상품만
        const matchesSide = !sideFilter || (sideTab === "category"
          ? (sideFilter === "미분류" ? !i.category : Boolean(i.category) && isUnder(i.category!, sideFilter))
          : sideTab === "supplier" ? (sideFilter === "매입처 없음" ? !i.supplierNames?.length : Boolean(i.supplierNames?.includes(sideFilter))) : true);
        return matchesSearch && matchesView && matchesSide &&
          (tax === "all" || i.taxType === tax) &&
          (active === "all" || (active === "active") === i.isActive) &&
          (mapped === "all" ||
            (mapped === "mapped") === i.linkedSupplierCount > 0);
      });
    },
    [items, search, tax, active, mapped, view, sideFilter, sideTab],
  );
  const sideItems = useMemo(() => {
    const counts = new Map<string, number>();
    if (sideTab === "category") {
      // 대 › 중 › 소 트리(위 분류에 아래 상품 수를 더함), 순서는 경로 순
      for (const item of items) for (const path of item.category ? categoryAncestors(item.category) : ["미분류"]) counts.set(path, (counts.get(path) || 0) + 1);
      return Array.from(counts, ([name, count]) => ({ name, count, depth: name === "미분류" ? 0 : splitCategory(name).length - 1 }))
        .sort((a, b) => (a.name === "미분류" ? 1 : b.name === "미분류" ? -1 : compareCategoryPath(a.name, b.name, folderOrder)));
    }
    for (const item of items) {
      const names = sideTab === "supplier"
        ? item.supplierNames?.length ? item.supplierNames : ["매입처 없음"]
        : ["공통 카테고리 미연결"];
      for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count, depth: 0 })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [items, sideTab, folderOrder]);
  const sideVisible = sideItems.filter((item) => {
    if (item.depth === 0) return true;
    const parent = splitCategory(item.name).slice(0, -1).join(" > ");
    return sideOpen.has(parent) || (Boolean(sideFilter) && isUnder(sideFilter, parent));
  });
  const columns = useMemo<CommonTableColumn<ProductCatalogAdminItem>[]>(() => [
    ...(canManageCategories ? [{ key: "pick", label: "선택", width: 52, sortable: false, value: (i: ProductCatalogAdminItem) => (picked.has(i.id) ? "선택" : ""), render: (i: ProductCatalogAdminItem) =>
      <input aria-label={`${i.name} 선택`} checked={picked.has(i.id)} className="h-4 w-4" onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(i.id); else next.delete(i.id); return next; })} type="checkbox" /> }] : []),
    ...(canManageCategories ? [{ key: "dragHandle", label: "이동", width: 52, sortable: false, value: () => "", render: (i: ProductCatalogAdminItem) =>
      <span aria-label={`${i.name} 폴더로 끌어 옮기기`} className="cursor-grab select-none px-2 text-slate-400" draggable onDragEnd={() => setDragProduct(null)} onDragStart={(event) => { setDragProduct(i); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", i.id); }} role="img" title="폴더로 끌어 옮기기">⋮⋮</span> }] : []),
    { key: "code", label: "ERP 코드", width: 90, value: (i) => i.productCode || "-" },
    { key: "name", label: "상품명 / 관리명", width: 150, value: (i) => `${i.name} ${i.managementName || ""} ${i.category || "미분류"}`, render: (i) => <button className="text-left font-bold hover:text-teal-700" onClick={() => setEditing(i)} type="button">{i.name}<span className="block text-xs font-normal text-slate-500">{i.managementName || "-"}</span><span className="block max-w-[180px] truncate text-[11px] font-normal text-teal-700" title={i.category || "미분류"}>{(i.category || "미분류").replaceAll(" > ", " › ")}</span></button> },
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
    { key: "promoNow", label: "행사 상태", width: 120, value: (i) => (i.promotion ? `${i.promotion.badge} ~${i.promotion.endsOn}` : ""), render: (i) => (i.promotion ? <a className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${i.promotion.badge === "임박" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}`} href={`/revenue/pricing/promotions?productId=${i.id}`} title={`${i.promotion.badge}가 ${money(i.promotion.price)} · ${i.promotion.startsOn} ~ ${i.promotion.endsOn}`}>{i.promotion.badge} ~{i.promotion.endsOn.slice(5).replace("-", "/")}</a> : <span className="text-slate-400">-</span>) },
    { key: "promoPrice", label: "행사가", align: "right", defaultHidden: true, width: 90, value: (i) => i.promotion?.price, render: (i) => (i.promotion ? money(i.promotion.price) : "-") },
    { key: "promo", label: "행사·임박", defaultHidden: true, sortable: false, width: 120, value: () => "", render: (i) => <span className="flex gap-2 text-sm font-bold text-teal-800 underline"><a href={`/revenue/pricing/promotions?new=${encodeURIComponent("행사")}&productId=${i.id}`}>행사 걸기</a><a href={`/revenue/pricing/promotions?new=${encodeURIComponent("임박")}&productId=${i.id}`}>임박 등록</a></span> },
  ], [canManageCategories, picked]);
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="maju-section-card self-start overflow-hidden lg:sticky lg:top-4">
        <div className={`grid border-b p-2 ${categoriesEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
          <button className={`rounded-lg px-3 py-2 text-sm font-bold ${sideTab === "category" ? "bg-teal-700 text-white" : "text-slate-600"}`} onClick={() => { setSideTab("category"); setSideFilter(""); }} type="button">분류</button>
          <button className={`rounded-lg px-3 py-2 text-sm font-bold ${sideTab === "supplier" ? "bg-teal-700 text-white" : "text-slate-600"}`} onClick={() => { setSideTab("supplier"); setSideFilter(""); }} type="button">매입처</button>
          {categoriesEnabled ? <button className={`rounded-lg px-2 py-2 text-xs font-bold ${sideTab === "maju-category" ? "bg-teal-700 text-white" : "text-slate-600"}`} onClick={() => setSideTab("maju-category")} type="button">마주 공통 카테고리</button> : null}
        </div>
        {sideTab === "maju-category" ? <p className="border-b bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">CategoryMatch 연결 전 상품은 미연결로 모아 봅니다. 연결 편집은 SQL 승인 후 제공합니다.</p> : null}
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {sideFilter ? <button className="mb-1 w-full rounded-lg px-3 py-1.5 text-left text-xs font-bold text-teal-700 hover:bg-teal-50" onClick={() => setSideFilter("")} type="button">← 전체 보기</button> : null}
          {sideVisible.map((item) => {
            const label = sideTab === "category" && item.name !== "미분류" ? splitCategory(item.name).slice(-1)[0] : item.name;
            const hasChildren = sideTab === "category" && sideItems.some((x) => x.depth === item.depth + 1 && x.name.startsWith(item.name + " > "));
            const openNow = sideOpen.has(item.name);
            return (
              <div className={`flex items-center gap-1 rounded-lg text-sm ${dropTarget === item.name ? "bg-amber-100 ring-2 ring-amber-400" : sideFilter === item.name ? "bg-teal-50 text-teal-800" : "hover:bg-slate-50"}`} draggable={sideTab === "category" && canManageCategories && item.name !== "미분류"} key={item.name} onDragEnd={() => { setDragFolder(null); setDropTarget(null); }} onDragLeave={() => setDropTarget((current) => (current === item.name ? null : current))} onDragOver={(event) => { if (canDrop(dragFolder, item.name) || (sideTab === "category" && canMoveProduct(dragProduct, item.name))) { event.preventDefault(); setDropTarget(item.name); } }} onDragStart={(event) => { setDragFolder(item.name); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.name); }} onDrop={(event) => { event.preventDefault(); const from = dragFolder, product = dragProduct; setDragFolder(null); setDragProduct(null); setDropTarget(null); if (from && canDrop(from, item.name)) void moveFolder(from, item.name); else if (product && sideTab === "category" && canMoveProduct(product, item.name)) void moveProduct(product, item.name); }} style={{ paddingLeft: 4 + item.depth * 14 }}>
                {hasChildren ? <button aria-label={`${label} ${openNow ? "접기" : "펼치기"}`} className="w-5 shrink-0 text-xs text-slate-500" onClick={() => setSideOpen((prev) => { const next = new Set(prev); if (next.has(item.name)) next.delete(item.name); else next.add(item.name); return next; })} type="button">{openNow ? "▾" : "▸"}</button> : <span className="w-5 shrink-0" />}
                <button className={`flex min-w-0 flex-1 items-center justify-between py-2 pr-2 text-left ${item.depth === 0 ? "font-bold" : ""}`} onClick={() => setSideFilter(sideFilter === item.name ? "" : item.name)} type="button">
                  <span className="truncate">{label}</span><span className="text-xs text-slate-500">{item.count}</span>
                </button>
                {sideTab === "category" && canManageCategories && item.name !== "미분류" ? (
                  <span className="flex shrink-0 pr-1">
                    <button aria-label={`${label} 위로`} className="px-1 text-xs text-slate-400 hover:text-teal-700" onClick={() => void reorderFolder(item.name, -1)} type="button">▲</button>
                    <button aria-label={`${label} 아래로`} className="px-1 text-xs text-slate-400 hover:text-teal-700" onClick={() => void reorderFolder(item.name, 1)} type="button">▼</button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>
      <div className="min-w-0 space-y-4">
      {pickedItems.length ? <div aria-label="선택한 상품" className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-sm" role="group">
        <b>{pickedItems.length}개 선택</b>
        <button className="maju-button-primary min-h-[36px] px-3" onClick={() => void deletePicked()} type="button">삭제</button>
        {pickedItems.some((item) => !item.isActive) ? <button className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-3 font-bold" onClick={() => void restorePicked()} type="button">되살리기</button> : null}
        <button className="min-h-[36px] px-2 text-xs font-bold text-slate-600 underline" onClick={() => setPicked(new Set())} type="button">선택 해제</button>
      </div> : null}
      {moveMessage ? <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900" role="status">{moveMessage}</p> : null}
      {sideTab === "maju-category" && categoriesEnabled ? <CategoryMatchPanel companyId={companyId} /> : null}
      <section className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
              <h2 className="maju-section-title">상품관리</h2>
            <p className="mt-1 maju-muted-label">
              판매 단위와 공급 상품의 원가·환산을 한 곳에서 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="maju-button-secondary" onClick={() => setReviewingCategories(true)} type="button">분류 추천 검토</button>
            <button className="maju-button-primary inline-flex items-center gap-2" onClick={() => setEditing({ ...blank })}>
              <PackagePlus className="h-4 w-4" />상품 등록
            </button>
          </div>
        </div>
        <div className="grid gap-2 border-b p-4 sm:grid-cols-2 xl:grid-cols-5">
          {([['code','ERP 코드'],['name','상품명'],['spec','규격'],['unit','단위'],['barcode','바코드']] as const).map(([key, label]) => <input aria-label={`${label} 검색`} className="maju-input w-full" key={key} onChange={(e) => setSearch((value) => ({ ...value, [key]: e.target.value }))} placeholder={`${label} 검색`} value={search[key]} />)}
        </div>
        <div className="flex flex-wrap gap-2 border-b p-4">
          {([['all','전체'],['recent','방금 추가'],['negative','역마진'],['no-price','판매가 없음'],['no-code','ERP 코드 없음'],['duplicate-code','ERP 코드 중복'],['no-photo','사진 없음'],['promo','행사 중'],['soon','임박'],['no-promo','행사 없음']] as Array<[View,string]>).map(([key, label]) => <button className={`rounded-full border px-3 py-1.5 text-xs font-bold ${view === key ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}
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
              ["inactive", "판매중지·숨김"],
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
          <CommonDataTable columns={columns} emptyMessage="조건에 맞는 상품이 없습니다." filename="상품관리.csv" rowKey={(item) => item.id} rows={shown} settingsKey={settingsKey} />
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
      {reviewingCategories ? <CategoryRecommendationReview
        companyId={companyId}
        onClose={() => setReviewingCategories(false)}
        onUpdated={(updates) => setItems((current) => current.map((item) => updates[item.id] ? { ...item, category: updates[item.id] } : item))}
      /> : null}
      </div>
    </div>
  );
}

type CategorySuggestion = { id: string; name: string; category: string; suggestion: string };
function CategoryRecommendationReview({ companyId, onClose, onUpdated }: {
  companyId: string;
  onClose: () => void;
  onUpdated: (updates: Record<string, string>) => void;
}) {
  const [candidates, setCandidates] = useState<CategorySuggestion[]>([]), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1), [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all: CategorySuggestion[] = [];
      try {
        for (let next = 1; ; next += 1) {
          const query = new URLSearchParams({ action: "category-suggestions", page: String(next) });
          if (companyId) query.set("companyId", companyId);
          const response = await fetch(`/api/product-catalog?${query}`, { cache: "no-store" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message);
          all.push(...(payload.candidates || []));
          if (!payload.hasMore) break;
        }
        if (!cancelled) { setCandidates(all); setSelected(new Set(all.filter((item) => !item.category).map((item) => item.id))); }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "추천을 불러오지 못했습니다."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  const pageSize = 50, pageCount = Math.max(1, Math.ceil(candidates.length / pageSize));
  const visible = candidates.slice((page - 1) * pageSize, page * pageSize);
  const chosen = candidates.filter((item) => selected.has(item.id));
  async function save() {
    setSaving(true); setMessage("");
    const saved: Record<string, string> = {}, failures: string[] = [];
    try {
      for (let start = 0; start < chosen.length; start += 50) {
        const batch = chosen.slice(start, start + 50);
        const response = await fetch("/api/product-catalog", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-categories", companyId, updates: batch.map((item) => ({ id: item.id, category: item.suggestion, expectedCategory: item.category })) }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { failures.push(payload.message || `${start + 1}~${start + batch.length}번째 묶음 저장 실패`); continue; }
        for (const result of payload.results || []) {
          if (result.ok) saved[result.id] = result.category;
          else failures.push(`${batch.find((item) => item.id === result.id)?.name || result.id}: ${result.message}`);
        }
      }
      onUpdated(saved);
      setCandidates((current) => current.filter((item) => !saved[item.id]));
      setSelected((current) => { const next = new Set(current); Object.keys(saved).forEach((id) => next.delete(id)); return next; });
      setMessage(`${Object.keys(saved).length}개 저장 완료${failures.length ? ` · ${failures.length}개 실패: ${failures.slice(0, 3).join(" / ")}` : ""}`);
      setConfirming(false);
    } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-0 sm:p-4">
    <section aria-labelledby="category-review-title" aria-modal="true" className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-h-[calc(100vh-2rem)] sm:max-w-4xl sm:rounded-2xl" role="dialog">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div><h2 className="text-lg font-black" id="category-review-title">분류 추천 미리보기</h2><p className="mt-1 text-sm text-slate-600">추천은 자동 저장되지 않습니다. 적용할 상품만 남기고 확인해 주세요.</p></div>
        <button aria-label="분류 추천 검토 닫기" onClick={onClose} type="button"><X /></button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm">
        <span>추천 {candidates.length}개 · 선택 {chosen.length}개</span>
        <div className="flex gap-2"><button className="maju-button-secondary" onClick={() => setSelected(new Set(candidates.map((item) => item.id)))} type="button">전체 선택</button><button className="maju-button-secondary" onClick={() => setSelected(new Set())} type="button">전체 제외</button></div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? <p className="p-8 text-center text-sm text-slate-500">전체 상품의 추천을 불러오는 중입니다.</p> : !candidates.length ? <p className="p-8 text-center text-sm text-slate-500">확인할 새 추천이 없습니다.</p> : visible.map((item) => <label className="mb-2 grid cursor-pointer gap-2 rounded-xl border p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]" key={item.id}>
          <input aria-label={`${item.name} 추천 선택`} checked={selected.has(item.id)} className="h-5 w-5" onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} type="checkbox" />
          <span><b>{item.name}</b><span className={`block text-xs ${item.category ? "font-bold text-amber-700" : "text-slate-500"}`}>현재: {item.category || "미분류"}{item.category ? " · 기존 분류는 기본 제외" : ""}</span></span>
          <span className="text-sm font-bold text-teal-700">추천: {item.suggestion.replaceAll(" > ", " › ")}</span>
        </label>)}
      </div>
      {candidates.length > pageSize ? <div className="flex items-center justify-center gap-3 border-t p-2 text-sm"><button className="maju-button-secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">이전</button><span>{page} / {pageCount}</span><button className="maju-button-secondary" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} type="button">다음</button></div> : null}
      {message ? <p className={`border-t px-4 py-3 text-sm font-bold ${message.includes("실패") ? "text-amber-800" : "text-teal-800"}`} role="status">{message}</p> : null}
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
        {confirming ? <><span className="mr-auto text-sm font-bold text-rose-700">선택한 {chosen.length}개 상품의 분류를 저장합니다.</span><button className="maju-button-secondary" onClick={() => setConfirming(false)} type="button">돌아가기</button><button className="maju-button-primary" disabled={saving || !chosen.length} onClick={() => void save()} type="button">{saving ? "저장 중…" : "확인하고 저장"}</button></> : <><button className="maju-button-secondary" onClick={onClose} type="button">닫기</button><button className="maju-button-primary" disabled={!chosen.length} onClick={() => setConfirming(true)} type="button">선택 {chosen.length}개 저장 검토</button></>}
      </footer>
    </section>
  </div>;
}
type MatchWorkspace = {
  businessType: string;
  options: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; majuCategoryId: string; suggestion: null | { id: string; name: string; score: number } }>;
};
function CategoryMatchPanel({ companyId }: { companyId: string }) {
  const [workspace, setWorkspace] = useState<MatchWorkspace | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState("");
  useEffect(() => {
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
    void fetch(`/api/product-categories/matches${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message);
        setWorkspace(payload);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "카테고리 연결을 불러오지 못했습니다."));
  }, [companyId]);
  async function save(categoryId: string, majuCategoryId: string) {
    if (!majuCategoryId) return;
    setSaving(categoryId);
    setError("");
    try {
      const response = await fetch("/api/product-categories/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, companyId, majuCategoryId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      setWorkspace((current) => current && ({ ...current, categories: current.categories.map((item) => item.id === categoryId ? { ...item, majuCategoryId } : item) }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카테고리 연결을 저장하지 못했습니다.");
    } finally {
      setSaving("");
    }
  }
  return <section className="maju-section-card p-4">
    <h2 className="maju-section-title">마주 공통 카테고리 맞추기</h2>
    <p className="mt-1 text-sm text-slate-600">회사 업종 {workspace?.businessType || "미설정"} · 이름과 업종으로 자동 추천합니다.</p>
    {error ? <p className="mt-3 text-sm font-bold text-rose-700" role="alert">{error}</p> : null}
    {workspace ? <div className="mt-4 space-y-2">{workspace.categories.map((item) => <CategoryMatchRow item={item} key={item.id} onSave={save} options={workspace.options} saving={saving === item.id} />)}</div> : <p className="mt-4 text-sm text-slate-500">카테고리 연결을 불러오는 중입니다.</p>}
  </section>;
}
function CategoryMatchRow({ item, onSave, options, saving }: { item: MatchWorkspace["categories"][number]; onSave: (categoryId: string, majuCategoryId: string) => Promise<void>; options: MatchWorkspace["options"]; saving: boolean }) {
  const [selected, setSelected] = useState(item.majuCategoryId || item.suggestion?.id || "");
  return <div className="grid items-center gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_minmax(180px,1fr)_80px]">
    <div><b>{item.name}</b>{item.suggestion ? <span className="ml-2 text-xs text-teal-700">추천 {item.suggestion.score}%</span> : null}</div>
    <select className="maju-input w-full" onChange={(event) => setSelected(event.target.value)} value={selected}>
      <option value="">연결 안 함</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
    <button className="maju-button-secondary" disabled={saving || !selected} onClick={() => void onSave(item.id, selected)} type="button">저장</button>
  </div>;
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
    [marginRate, setMarginRate] = useState(item.purchasePrice && item.salesPrice != null ? String(Math.round(((item.salesPrice / item.purchasePrice) - 1) * 1000) / 10) : ""),
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
          <Field label="고객사 ERP 코드">
            <input className="maju-input w-full" disabled placeholder="미등록" value={d.productCode || ""} />
          </Field>
          <Field label="바코드">
            <input className="maju-input w-full" value={d.barcodes?.[0] || ""} onChange={(e) => put("barcodes", e.target.value ? [e.target.value] : [])} />
          </Field>
          <h3 className="mt-2 border-b pb-2 text-sm font-black text-slate-800 sm:col-span-2 lg:col-span-4">분류 · 매입처 · 보관</h3>
          <CategoryFields item={d} onChange={(category) => put("category", category)} />
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
              list="product-origin-options"
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
                list="product-unit-options"
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
              list="product-unit-options"
              required
              value={d.purchaseUnit}
              onChange={(e) => put("purchaseUnit", e.target.value)}
            />
          </Field>
          <Field label="판매 단위">
            <input
              className="maju-input w-full"
              list="product-unit-options"
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
            <input className="maju-input w-full" min="0" required type="number" value={d.purchasePrice} onChange={(e) => { const purchasePrice = Number(e.target.value) || 0; setD((current) => ({ ...current, purchasePrice, salesPrice: marginRate === "" ? current.salesPrice : Math.round(purchasePrice * (1 + Number(marginRate) / 100)) })); }} />
          </Field>
          <Field label="기본 마진 (%)">
            <input className="maju-input w-full" min="-100" step="0.1" type="number" value={marginRate} onChange={(e) => { const value = e.target.value; setMarginRate(value); if (value !== "") put("salesPrice", Math.round(d.purchasePrice * (1 + Number(value) / 100))); }} />
          </Field>
          <Field label="판매가">
            <input
              className="maju-input w-full"
              min="0"
              type="number"
              value={d.salesPrice ?? ""}
              onChange={(e) =>
                setD((current) => {
                  const salesPrice = e.target.value ? Number(e.target.value) : undefined;
                  if (salesPrice != null && current.purchasePrice) setMarginRate(String(Math.round(((salesPrice / current.purchasePrice) - 1) * 1000) / 10));
                  return { ...current, salesPrice };
                })
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
          <datalist id="product-unit-options">{units.map((value) => <option key={value} value={value} />)}</datalist>
          <datalist id="product-origin-options">{origins.map((value) => <option key={value} value={value} />)}</datalist>
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
function CategoryFields({ item, onChange }: { item: ProductCatalogAdminItem; onChange: (category: string) => void }) {
  const parts = splitCategory(item.category || "");
  const options = categoryLevelOptions(item.category || "");
  const select = (depth: number, value: string) => onChange(joinCategory([...parts.slice(0, depth), value]));
  const suggestion = suggestCategory(item.name, item.spec || "");
  return (
    <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
      <span className="text-xs font-bold text-slate-600">분류 (대 › 중 › 소)</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([
          ["대분류", "product-large-category-options", options.large, parts[0] || ""],
          ["중분류", "product-medium-category-options", options.medium, parts[1] || ""],
          ["소분류", "product-small-category-options", options.small, parts[2] || ""],
        ] as const).map(([label, list, names, value], depth) => <div key={label}>
          <input aria-label={`${label} 검색 선택`} className="maju-input w-full" disabled={depth > 0 && !parts[depth - 1]} list={list} onChange={(event) => select(depth, event.target.value)} placeholder={`${label} 검색`} value={value} />
          <datalist id={list}>{names.map((name) => <option key={name} value={name} />)}</datalist>
        </div>)}
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-2">
        {suggestion && suggestion !== item.category ? <button className="maju-button-secondary min-h-11" onClick={() => onChange(suggestion)} type="button">추천 적용: {suggestion.replaceAll(" > ", " › ")}</button> : null}
        {item.category ? <button className="text-xs font-bold text-slate-500 underline" onClick={() => onChange("")} type="button">분류 지우기</button> : null}
      </div>
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
