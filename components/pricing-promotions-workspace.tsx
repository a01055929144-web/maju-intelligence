"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { documentRequest } from "@/lib/pricing/document-client";
import { koreaDay, type CatalogChoice, type Promotion } from "@/domains/pricing/document";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";
import { discountPercent, regularPrice } from "@/domains/pricing/promotion-display";
import { Tabs } from "./ui/tabs";
import { filterIndex, type IndexItem } from "@/domains/pricing/catalog-filter";
import { buildFolderTree, toFolderOrder, type FolderOrder } from "@/domains/pricing/category-tree";
import { inFolder } from "@/domains/pricing/margin-tree";
import { audienceLabel, type Audience, type AudienceSummary, type AudienceTarget } from "@/domains/pricing/promotion-audience";

// CC-20: 행사·임박 독립 화면. 데이터·명령은 기존 pricing_promotions API(documentRequest) 그대로, DB 변경 없음.
type Kind = "행사" | "임박";
type Status = "active" | "upcoming" | "ended";
const field = "h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm";

function statusOf(x: Promotion, today: string): Status {
  if (today > x.endsOn || x.stock === 0) return "ended";
  return today < x.startsOn ? "upcoming" : "active";
}

// CC-30c: audienceEnabled(PROMOTION_AUDIENCE, 기본 OFF)일 때만 "대상" 열과 서랍의 노출 대상 고르기가 보인다. 29b SQL 적용 뒤에 켠다.
export function PricingPromotionsWorkspace({ companyId, manager, userKey, audienceEnabled = false }: { companyId: string; manager: boolean; userKey: string; audienceEnabled?: boolean }) {
  const [rows, setRows] = useState<Promotion[]>([]);
  const [kind, setKind] = useState<Kind>("행사");
  const [status, setStatus] = useState<Status | "all">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState<{ promo: Promotion | null } | null>(null);
  const [audiences, setAudiences] = useState<Record<string, AudienceSummary>>({});
  const today = koreaDay();

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      setRows((await documentRequest<Promotion[]>(companyId, "promotions")).result);
      if (audienceEnabled) {
        const res = await fetch(`/api/promotion-audience?${new URLSearchParams({ companyId })}`, { cache: "no-store" });
        if (res.ok) setAudiences(Object.fromEntries(((await res.json()) as { summary: AudienceSummary[] }).summary.map((x) => [x.promotionId, x])));
      }
    }
    catch (e) { setError(e instanceof Error ? e.message : "불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [companyId, audienceEnabled]);
  useEffect(() => { void load(); }, [load]);

  // 상품관리 줄 메뉴에서 오는 주소: ?new=행사|임박&productId=… → 서랍을 상품 채운 상태로 연다.
  const [presetProduct, setPresetProduct] = useState("");
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const wanted = query.get("new");
    if (manager && (wanted === "행사" || wanted === "임박")) { setKind(wanted); setPresetProduct(query.get("productId") || ""); setDrawer({ promo: null }); }
  }, [manager]);

  const ofKind = useMemo(() => rows.filter((x) => x.badge === kind), [rows, kind]);
  const count = (s: Status) => ofKind.filter((x) => statusOf(x, today) === s).length;
  const visible = ofKind.filter((x) => status === "all" || statusOf(x, today) === status);
  const dateLabel = kind === "임박" ? "유통기한" : "기간";

  const columns: CommonTableColumn<Promotion>[] = [
    { key: "name", label: "상품", value: (x) => x.displayName || x.name, sortable: true },
    { key: "regular", label: "정상가", value: (x) => regularPrice(x), align: "right", render: (x) => { const r = regularPrice(x); return r === null ? "-" : `${r.toLocaleString()}원`; } },
    { key: "price", label: kind === "임박" ? "처분가" : "행사가", value: (x) => x.price, align: "right", sortable: true, render: (x) => `${x.price.toLocaleString()}원` },
    { key: "discount", label: "할인율", value: (x) => discountPercent(x), align: "right", sortable: true, render: (x) => { const d = discountPercent(x); return d === null ? "-" : `${d}%`; } },
    { key: "period", label: dateLabel, value: (x) => (kind === "임박" ? x.endsOn : `${x.startsOn} ~ ${x.endsOn}`), sortable: true },
    { key: "stock", label: "남은 수량", value: (x) => x.stock ?? "제한 없음", align: "right" },
    ...(audienceEnabled ? [{ key: "audience", label: "대상", value: (x: Promotion) => audienceLabel(audiences[x.id]) }] : []),
    { key: "status", label: "상태", value: (x) => ({ active: "진행 중", upcoming: "예정", ended: "끝남" })[statusOf(x, today)] },
    ...(manager ? [{ key: "edit", label: "관리", value: () => "", render: (x: Promotion) => <button className="min-h-[44px] px-2 text-sm font-bold text-teal-800 underline" onClick={() => { setPresetProduct(""); setDrawer({ promo: x }); }} type="button">수정</button> }] : []),
  ];

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Tabs ariaLabel="행사·임박" items={[{ id: "행사", label: "행사" }, { id: "임박", label: "임박" }]} onChange={(id) => setKind(id as Kind)} value={kind} />
      {manager ? <button className="maju-button-primary min-h-[44px] px-4" onClick={() => { setPresetProduct(""); setDrawer({ promo: null }); }} type="button">{kind} 등록</button> : null}
    </div>
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태">
      {([["active", "진행 중"], ["upcoming", "예정"], ["ended", "끝남"], ["all", "전체"]] as const).map(([id, label]) =>
        <button aria-pressed={status === id} className={`min-h-[36px] rounded-full border px-3 text-sm font-bold ${status === id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`} key={id} onClick={() => setStatus(id)} type="button">{label}{id === "all" ? ` ${ofKind.length}` : ` ${count(id)}`}</button>)}
    </div>
    {message ? <p role="status" className="rounded border border-teal-300 bg-teal-50 p-3 text-sm text-teal-900">{message}</p> : null}
    <CommonDataTable columns={columns} emptyMessage={`${status === "all" ? "" : "해당 상태의 "}${kind} 상품이 없습니다.`} error={error || null} filename={`${kind}.csv`} loading={loading} phoneCards rowKey={(x) => x.id} rows={visible} settingsKey={`promotions-${kind}:${userKey}`} />
    {drawer ? <PromotionDrawer audienceEnabled={audienceEnabled} companyId={companyId} initialAudience={drawer.promo ? audiences[drawer.promo.id]?.audience ?? "all" : "all"} kind={kind} onClose={() => setDrawer(null)} onSaved={(text) => { setDrawer(null); setMessage(text); void load(); }} preset={presetProduct} promo={drawer.promo} /> : null}
  </div>;
}

function PromotionDrawer({ audienceEnabled, companyId, initialAudience, kind, onClose, onSaved, preset, promo }: { audienceEnabled: boolean; companyId: string; initialAudience: Audience; kind: Kind; onClose: () => void; onSaved: (text: string) => void; preset: string; promo: Promotion | null }) {
  const today = koreaDay();
  const [choices, setChoices] = useState<CatalogChoice[]>([]);
  // CC-26: 상품 고르기에 분류 폴더 필터(상품관리와 같은 폴더·순서). 폴더 목록을 못 읽으면 폴더 칸만 숨기고 검색은 그대로 쓴다.
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [folderOrder, setFolderOrder] = useState<FolderOrder>(new Map());
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState(promo?.productId || preset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(initialAudience === "except");
  const [aud, setAud] = useState<Audience>(initialAudience);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [found, setFound] = useState<Array<{ id: string; name: string }>>([]);
  const audienceCall = async (query: Record<string, string>) => {
    const res = await fetch(`/api/promotion-audience?${new URLSearchParams({ companyId, ...query })}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as { message?: string; templates?: Array<{ id: string; name: string }>; customers?: Array<{ id: string; name: string }>; selected?: { customers: Array<{ id: string; name: string }>; templateIds: string[] } | null };
    if (!res.ok) throw new Error(data.message || "노출 대상을 불러오지 못했습니다.");
    return data;
  };
  useEffect(() => {
    if (!audienceEnabled) return;
    audienceCall(promo && initialAudience !== "all" ? { promotionId: promo.id } : {}).then((data) => {
      setTemplates(data.templates ?? []);
      if (data.selected) { setCustomers(data.selected.customers); setTemplateIds(data.selected.templateIds); }
    }).catch((e) => setError(e instanceof Error ? e.message : "노출 대상을 불러오지 못했습니다."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const searchStores = async (q: string) => { if (!q.trim()) return setFound([]); try { setFound((await audienceCall({ q })).customers ?? []); } catch (e) { setError(e instanceof Error ? e.message : "매장을 찾지 못했습니다."); } };
  const search = async (q: string) => {
    try { setChoices((await documentRequest<{ items: CatalogChoice[] }>(companyId, "catalog", { search: q })).result.items); }
    catch (e) { setError(e instanceof Error ? e.message : "상품을 찾지 못했습니다."); }
  };
  useEffect(() => { void search(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const q = new URLSearchParams({ companyId });
    void fetch(`/api/pricing-documents/catalog-index?${q}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).then((b: { items?: IndexItem[] }) => setIndex(b.items ?? [])).catch(() => setIndex([]));
    void fetch(`/api/price-sheets/folder-order?${q}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { folders: [] })).then((b: { folders?: Array<{ path: string; sortOrder: number }> }) => setFolderOrder(toFolderOrder(b.folders ?? []))).catch(() => setFolderOrder(new Map()));
  }, [companyId]);
  const tree = useMemo(() => buildFolderTree(index.flatMap((item) => (item.category ? [item.category] : [])), folderOrder), [index, folderOrder]);
  // 폴더를 고르면 그 폴더(하위 포함) 상품 중 검색어에 맞는 것을 보여 준다(한 번에 300개까지).
  const options = useMemo<Array<{ id: string; name: string }>>(() => folder
    ? filterIndex(index.filter((item) => inFolder(item.category || "", folder)), { all: query, code: "", name: "", spec: "", unit: "" }).slice(0, 300).map((item) => ({ id: item.id, name: item.displayName || item.name }))
    : choices, [folder, index, query, choices]);

  async function save(form: FormData) {
    setBusy(true); setError("");
    try {
      const num = (key: string) => (form.get(key) === "" ? null : Number(form.get(key)));
      const product = options.find((c) => c.id === productId) || choices.find((c) => c.id === productId);
      const savedId = promo?.id || crypto.randomUUID();
      await documentRequest(companyId, "save-promotion", {
        id: savedId, expected: promo?.revision || 0,
        content: {
          productId, name: promo?.name || product?.name || "", displayName: String(form.get("displayName") || ""),
          startsOn: String(form.get("startsOn")), endsOn: String(form.get("endsOn")),
          cost: Number(form.get("cost")), margin: Number(form.get("margin")), stock: num("stock"), perStoreLimit: num("perStoreLimit"),
          allowSheet: form.get("allowSheet") === "on", badge: kind, taxType: promo?.taxType || "taxable",
        },
      }, true);
      if (audienceEnabled && (aud !== "all" || initialAudience !== "all")) {
        // 저장이 revision을 올리므로 최신 revision을 다시 읽어 대상을 한 번에 교체한다(실패하면 행사는 저장된 상태로 알린다).
        const latest = (await documentRequest<Promotion[]>(companyId, "promotions")).result.find((x) => x.id === savedId);
        const targets: AudienceTarget[] = aud === "all" ? [] : [...customers.map((c) => ({ kind: "customer" as const, id: c.id })), ...templateIds.map((t) => ({ kind: "template" as const, id: t }))];
        const res = await fetch("/api/promotion-audience", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, promotionId: savedId, expected: latest?.revision ?? 0, audience: aud, targets }) });
        if (!res.ok) throw new Error(`${kind}은 저장했지만 노출 대상은 저장하지 못했습니다: ${((await res.json().catch(() => ({}))) as { message?: string }).message || "다시 시도해 주세요."} (대상 저장 전까지 전체 매장에 노출될 수 있습니다.)`);
      }
      onSaved(`${kind}을 저장했습니다.`);
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!promo || !window.confirm(`이 ${kind}을 삭제할까요? 이미 발행한 문서는 그대로입니다.`)) return;
    setBusy(true); setError("");
    try { await documentRequest(companyId, "delete-promotion", { id: promo.id, expected: promo.revision }, true); onSaved(`${kind}을 삭제했습니다.`); }
    catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
    <form aria-label={`${kind} ${promo ? "수정" : "등록"}`} aria-modal="true" className="h-full w-full max-w-md space-y-3 overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void save(new FormData(e.currentTarget)); }} role="dialog">
      <h2 className="text-lg font-black">{kind} {promo ? "수정" : "등록"}</h2>
      {error ? <p role="alert" className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800">{error}</p> : null}
      <label className="block text-sm font-bold">상품 검색
        <input aria-label="상품 검색" className={`${field} mt-1`} onChange={(e) => { setQuery(e.target.value); void search(e.target.value); }} placeholder="상품명·분류" />
      </label>
      {tree.length ? <label className="block text-sm font-bold">분류 폴더
        <select aria-label="분류 폴더" className={`${field} mt-1`} disabled={Boolean(promo)} onChange={(e) => setFolder(e.target.value)} value={folder}>
          <option value="">분류 전체</option>
          {tree.map((node) => <option key={node.path} value={node.path}>{"  ".repeat(node.depth)}{node.name} ({node.count})</option>)}
        </select>
      </label> : null}
      <label className="block text-sm font-bold">상품
        <select className={`${field} mt-1`} disabled={Boolean(promo)} onChange={(e) => setProductId(e.target.value)} required value={productId}>
          <option value="">상품 선택</option>
          {productId && !options.some((c) => c.id === productId) ? <option value={productId}>{promo?.name || "선택한 상품"}</option> : null}
          {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-bold">{kind === "임박" ? "처분 매입가" : "행사 매입가"}<input className={`${field} mt-1 text-right`} defaultValue={promo?.cost ?? ""} min="0" name="cost" required step="0.01" type="number" /></label>
        <label className="block text-sm font-bold">마진(%)<input className={`${field} mt-1 text-right`} defaultValue={promo?.margin ?? ""} min="0" name="margin" required step="0.01" type="number" /></label>
        <label className="block text-sm font-bold">{kind === "임박" ? "시작일" : "시작일"}<input className={`${field} mt-1`} defaultValue={promo?.startsOn || today} name="startsOn" required type="date" /></label>
        <label className="block text-sm font-bold">{kind === "임박" ? "유통기한(그날 종료)" : "종료일"}<input className={`${field} mt-1`} defaultValue={promo?.endsOn || ""} name="endsOn" required type="date" /></label>
        <label className="col-span-2 block text-sm font-bold">{kind === "임박" ? "남은 수량" : "행사 재고(선택)"}<input className={`${field} mt-1 text-right`} defaultValue={promo?.stock ?? ""} min="0" name="stock" required={kind === "임박"} step="1" type="number" /></label>
      </div>
      {audienceEnabled ? <fieldset className="space-y-2 rounded border border-slate-200 p-3">
        <legend className="px-1 text-sm font-bold">노출 대상</legend>
        <label className="flex items-center gap-2 text-sm"><input checked={aud === "all"} name="audience" onChange={() => setAud("all")} type="radio" />전체 매장</label>
        <label className="flex items-center gap-2 text-sm"><input checked={aud !== "all"} name="audience" onChange={() => setAud("only")} type="radio" />특정 매장만</label>
        {aud !== "all" ? <div className="space-y-2">
          {more ? <label className="flex items-center gap-2 text-sm"><input checked={aud === "except"} onChange={(e) => setAud(e.target.checked ? "except" : "only")} type="checkbox" />고른 대상은 제외하고 나머지에 노출</label> : null}
          <input aria-label="매장 찾기" className={field} onChange={(e) => void searchStores(e.target.value)} placeholder="매장 이름 검색" />
          {found.length ? <ul className="max-h-32 divide-y overflow-y-auto rounded border text-sm">{found.map((c) => <li key={c.id}><button className="min-h-[36px] w-full px-2 text-left hover:bg-slate-50 disabled:text-slate-400" disabled={customers.some((x) => x.id === c.id)} onClick={() => setCustomers([...customers, c])} type="button">{c.name}</button></li>)}</ul> : null}
          <div className="flex flex-wrap gap-1.5">{customers.map((c) => <button aria-label={`${c.name} 빼기`} className="min-h-[32px] rounded-full border border-teal-700 px-2 text-xs font-bold text-teal-800" key={c.id} onClick={() => setCustomers(customers.filter((x) => x.id !== c.id))} type="button">{c.name} ✕</button>)}</div>
          {more && templates.length ? <div aria-label="등급" className="flex flex-wrap gap-1.5" role="group">{templates.map((t) => <button aria-pressed={templateIds.includes(t.id)} className={`min-h-[32px] rounded-full border px-2 text-xs font-bold ${templateIds.includes(t.id) ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300"}`} key={t.id} onClick={() => setTemplateIds(templateIds.includes(t.id) ? templateIds.filter((x) => x !== t.id) : [...templateIds, t.id])} type="button">등급 {t.name}</button>)}</div> : null}
          {customers.length + templateIds.length === 0 ? <p className="text-xs text-rose-700">대상을 하나 이상 골라 주세요.</p> : null}
        </div> : null}
      </fieldset> : null}
      <button aria-expanded={more} className="min-h-[44px] text-sm font-bold text-slate-600 underline" onClick={() => setMore(!more)} type="button">더보기</button>
      <div className={more ? "space-y-2" : "hidden"}>
        <label className="block text-sm font-bold">노출 이름<input className={`${field} mt-1`} defaultValue={promo?.displayName || ""} maxLength={80} name="displayName" /></label>
        <label className="block text-sm font-bold">매장당 한도<input className={`${field} mt-1 text-right`} defaultValue={promo?.perStoreLimit ?? ""} min="1" name="perStoreLimit" step="1" type="number" /></label>
        <label className="flex items-center gap-2 text-sm font-bold"><input defaultChecked={promo?.allowSheet ?? true} name="allowSheet" type="checkbox" />단가표에도 넣기</label>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || !productId || (audienceEnabled && aud !== "all" && customers.length + templateIds.length === 0)} type="submit">저장</button>
        <button className="min-h-[44px] rounded-lg border px-4" onClick={onClose} type="button">닫기</button>
        {promo ? <button className="ml-auto min-h-[44px] px-3 text-sm font-bold text-rose-700" disabled={busy} onClick={() => void remove()} type="button">삭제</button> : null}
      </div>
    </form>
  </div>;
}
