"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DocumentContent, DocumentInfoItem } from "@/domains/pricing/document";
import { DEFAULT_DISPLAY } from "@/domains/pricing/document";
import { PAYMENT_CYCLE_OPTIONS } from "@/domains/organization/company-profile";
import { formatPhoneNumber } from "@/lib/phone";

type Profile = { company?: { name?: string; businessRegistrationNumber?: string; originAddress?: string }; values?: Record<string, unknown>; canEdit?: boolean };
type Editor = "text" | "phone" | "time" | "number" | "weekdays" | "cycle" | "methods" | "account" | "none";
type Candidate = { key: string; label: string; place: "header" | "footer"; value: string; editor: Editor; field?: string; placeholder?: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const METHODS = ["계좌이체", "카드", "현금"];
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function formatBusinessNumber(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : value;
}

/** 회사 정보 값 → 문서에 넣을 수 있는 줄 목록. 주소는 사업장 주소가 없으면 출발지 주소를 씁니다. */
export function buildInfoCandidates(profile: Profile): Candidate[] {
  const v = profile.values || {};
  const days = Array.isArray(v.delivery_weekdays) ? (v.delivery_weekdays as number[]).filter((d) => d >= 0 && d <= 6).sort().map((d) => WEEKDAYS[d]).join("·") : "";
  const cutoff = text(v.next_day_cutoff_time).slice(0, 5);
  const minimum = typeof v.first_order_minimum_won === "number" && v.first_order_minimum_won > 0 ? `${v.first_order_minimum_won.toLocaleString()}원` : "";
  const account = [text(v.settlement_bank), text(v.settlement_account_number), text(v.settlement_account_holder)].filter(Boolean).join(" ");
  const methods = Array.isArray(v.payment_methods) ? (v.payment_methods as string[]).join("·") : "";
  const address = [text(v.business_address), text(v.business_address_detail)].filter(Boolean).join(" ") || text(profile.company?.originAddress);
  return [
    { editor: "phone", field: "main_phone", key: "main_phone", label: "대표 연락처", place: "header", value: formatPhoneNumber(text(v.main_phone)), placeholder: "010-0000-0000" },
    { editor: "none", key: "business_number", label: "사업자번호", place: "header", value: formatBusinessNumber(text(profile.company?.businessRegistrationNumber)) },
    { editor: "text", field: "business_address", key: "business_address", label: "주소", place: "header", value: address, placeholder: "도로명 주소" },
    { editor: "text", field: "fax", key: "fax", label: "팩스", place: "header", value: formatPhoneNumber(text(v.fax)), placeholder: "02-000-0000" },
    { editor: "text", field: "email", key: "email", label: "이메일", place: "header", value: text(v.email), placeholder: "name@example.com" },
    { editor: "text", field: "consult_hours", key: "consult_hours", label: "상담 시간", place: "header", value: text(v.consult_hours), placeholder: "09:00~18:00" },
    { editor: "time", field: "next_day_cutoff_time", key: "next_day_cutoff_time", label: "주문 마감", place: "footer", value: cutoff ? `전날 ${cutoff}` : "" },
    { editor: "weekdays", field: "delivery_weekdays", key: "delivery_weekdays", label: "배송 요일", place: "footer", value: days },
    { editor: "text", field: "delivery_time_window", key: "delivery_time_window", label: "배송 시간", place: "footer", value: text(v.delivery_time_window), placeholder: "04:00~08:00" },
    { editor: "number", field: "first_order_minimum_won", key: "first_order_minimum_won", label: "최소 주문", place: "footer", value: minimum, placeholder: "원" },
    { editor: "cycle", field: "payment_cycle", key: "payment_cycle", label: "결제 조건", place: "footer", value: text(v.payment_cycle) },
    { editor: "methods", field: "payment_methods", key: "payment_methods", label: "결제 방식", place: "footer", value: methods },
    { editor: "account", key: "settlement_account", label: "입금 계좌", place: "footer", value: account }
  ];
}

function initialDraft(candidate: Candidate, values: Record<string, unknown>): Record<string, unknown> {
  switch (candidate.editor) {
    case "weekdays": return { delivery_weekdays: Array.isArray(values.delivery_weekdays) ? values.delivery_weekdays : [] };
    case "methods": return { payment_methods: Array.isArray(values.payment_methods) ? values.payment_methods : [] };
    case "account": return { settlement_bank: text(values.settlement_bank), settlement_account_number: text(values.settlement_account_number), settlement_account_holder: text(values.settlement_account_holder) };
    case "number": return { first_order_minimum_won: values.first_order_minimum_won ?? "" };
    case "time": return { next_day_cutoff_time: text(values.next_day_cutoff_time).slice(0, 5) };
    case "phone": return { main_phone: formatPhoneNumber(text(values.main_phone)) };
    default: return candidate.field ? { [candidate.field]: candidate.field === "business_address" ? text(values.business_address) : text(values[candidate.field]) } : {};
  }
}

/**
 * 11/4: 오른쪽 '보여줄 정보' — 회사 정보에서 골라 넣고 빼기. 비었거나 고칠 값은 그 자리에서 입력하면
 * 회사 정보에 바로 저장되고 문서에도 체크됩니다(회사 정보 화면을 오가지 않음).
 */
export function PricingInfoPanel({ companyId, content, editable, onContent }: {
  readonly companyId: string;
  readonly content: DocumentContent;
  readonly editable: boolean;
  readonly onContent: (content: DocumentContent) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<{ key: string; draft: Record<string, unknown> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [basisBusy, setBasisBusy] = useState(false);
  const display = content.display || DEFAULT_DISPLAY;
  const latest = useRef(content);
  latest.current = content;

  useEffect(() => {
    let active = true;
    void fetch(`/api/company-profile?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: Profile | null) => { if (active) setProfile(payload || {}); })
      .catch(() => { if (active) setProfile({}); });
    return () => { active = false; };
  }, [companyId]);

  // CC-19c: 마진 템플릿이 켜진 회사만 목록이 온다(꺼져 있으면 404 → 선택 칸 숨김).
  useEffect(() => {
    let active = true;
    void fetch(`/api/margin-templates?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { templates?: Array<{ id: string; name: string }> } | null) => { if (active) setTemplates(payload?.templates || []); })
      .catch(() => { if (active) setTemplates([]); });
    return () => { active = false; };
  }, [companyId]);
  // 가격 기준을 바꾸면 행사·임박이 아닌 품목 가격만 그 템플릿(없으면 기본) 값으로 다시 계산한다. 이미 확정한 버전은 그대로.
  async function setBasis(templateId: string) {
    const current = latest.current;
    const productIds = Array.from(new Set(current.lines.filter((line) => !line.promotionId).map((line) => line.productId)));
    if (!productIds.length) { onContent({ ...current, ...(templateId ? { marginTemplateId: templateId } : { marginTemplateId: undefined }) }); return; }
    if (!window.confirm("일반 품목의 가격을 선택한 가격 기준으로 다시 계산합니다. 직접 고친 가격도 바뀝니다. 계속할까요?")) return;
    setBasisBusy(true); setMessage("");
    try {
      const response = await fetch("/api/margin-templates/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, templateId: templateId || null, productIds: productIds.slice(0, 300) }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "가격을 계산하지 못했습니다.");
      const prices = body.prices as Record<string, number>;
      const fresh = latest.current;
      onContent({ ...fresh, marginTemplateId: templateId || undefined, lines: fresh.lines.map((line) => (line.promotionId || prices[line.productId] === undefined ? line : { ...line, price: prices[line.productId] })) });
      setMessage("가격 기준을 적용했습니다. 매입가가 없는 품목은 가격을 그대로 뒀습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "가격을 계산하지 못했습니다."); }
    finally { setBasisBusy(false); }
  }

  // 회사명이 비어 있으면 회사 정보 이름으로 채웁니다. 문서에 넣은 값은 문서에서 고친 그대로 둡니다.
  useEffect(() => {
    if (!profile || !editable) return;
    const current = latest.current;
    if (!current.companyName.trim() && profile.company?.name) onContent({ ...current, companyName: profile.company.name.slice(0, 100) });
  }, [profile, editable]);

  const candidates = profile ? buildInfoCandidates(profile) : [];
  const setDisplay = (patch: Partial<typeof display>) => onContent({ ...content, display: { ...display, ...patch } });
  const isOn = (key: string) => display.info.some((item) => item.key === key);

  function toggle(candidate: Candidate, on: boolean, base = content) {
    const disp = base.display || DEFAULT_DISPLAY;
    const rest = disp.info.filter((item) => item.key !== candidate.key);
    const item: DocumentInfoItem = { key: candidate.key, label: candidate.label, place: candidate.place, value: candidate.value };
    onContent({ ...base, display: { ...disp, info: on ? [...rest, item] : rest } });
  }

  async function save(candidate: Candidate) {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/company-profile", { body: JSON.stringify({ companyId, values: editing.draft }), headers: { "Content-Type": "application/json" }, method: "PUT" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as (Profile & { message?: string }) | null;
    setSaving(false);
    if (!response?.ok || !payload) { setMessage(payload?.message || "회사 정보에 저장하지 못했습니다."); return; }
    setProfile(payload);
    setEditing(null);
    const fresh = buildInfoCandidates(payload).find((item) => item.key === candidate.key);
    const typed = Object.values(editing.draft).some((v) => (Array.isArray(v) ? v.length : String(v ?? "").trim()));
    if (typed && fresh && fresh.value === candidate.value) {
      setMessage(`${candidate.label}은(는) 대표(소유자) 계정만 바꿀 수 있어 저장되지 않았습니다.`);
      return;
    }
    if (fresh?.value) toggle(fresh, true, latest.current);
    else if (fresh) toggle(fresh, false, latest.current);
    setMessage(`${candidate.label}을(를) 회사 정보에 저장하고 문서에 넣었습니다.`);
  }

  const input = "h-8 w-full rounded border border-slate-300 px-2 text-xs";
  function editorFor(candidate: Candidate) {
    if (!editing) return null;
    const draft = editing.draft;
    const set = (patch: Record<string, unknown>) => setEditing({ key: editing.key, draft: { ...draft, ...patch } });
    const field = candidate.field || "";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void save(candidate); } if (e.key === "Escape") setEditing(null); };
    let control: ReactNode = null;
    switch (candidate.editor) {
      case "phone": control = <input aria-label={`${candidate.label} 입력`} autoFocus className={input} inputMode="tel" onChange={(e) => set({ [field]: formatPhoneNumber(e.target.value) })} onKeyDown={onKey} placeholder={candidate.placeholder} value={String(draft[field] ?? "")} />; break;
      case "time": control = <input aria-label={`${candidate.label} 입력`} autoFocus className={input} onChange={(e) => set({ [field]: e.target.value })} onKeyDown={onKey} type="time" value={String(draft[field] ?? "")} />; break;
      case "number": control = <input aria-label={`${candidate.label} 입력`} autoFocus className={input} inputMode="numeric" onChange={(e) => set({ [field]: e.target.value.replace(/[^0-9]/g, "") })} onKeyDown={onKey} placeholder="원" value={String(draft[field] ?? "")} />; break;
      case "cycle": control = <select aria-label={`${candidate.label} 선택`} autoFocus className={input} onChange={(e) => set({ [field]: e.target.value })} value={String(draft[field] || "협의")}>{PAYMENT_CYCLE_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select>; break;
      case "weekdays": {
        const list = (draft[field] as number[]) || [];
        control = <div className="flex flex-wrap gap-1">{WEEKDAYS.map((d, i) => <button aria-pressed={list.includes(i)} className={`h-7 w-7 rounded text-xs font-bold ${list.includes(i) ? "bg-teal-700 text-white" : "bg-slate-100"}`} key={d} onClick={() => set({ [field]: list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort() })} type="button">{d}</button>)}</div>;
        break;
      }
      case "methods": {
        const list = (draft[field] as string[]) || [];
        control = <div className="flex flex-wrap gap-1">{METHODS.map((m) => <button aria-pressed={list.includes(m)} className={`rounded px-2 py-1 text-xs font-bold ${list.includes(m) ? "bg-teal-700 text-white" : "bg-slate-100"}`} key={m} onClick={() => set({ [field]: list.includes(m) ? list.filter((x) => x !== m) : [...list, m] })} type="button">{m}</button>)}</div>;
        break;
      }
      case "account":
        control = <div className="grid gap-1">{([["settlement_bank", "은행"], ["settlement_account_number", "계좌번호"], ["settlement_account_holder", "예금주"]] as const).map(([k, l], i) => <input aria-label={`입금 ${l}`} autoFocus={i === 0} className={input} key={k} onChange={(e) => set({ [k]: e.target.value })} onKeyDown={onKey} placeholder={l} value={String(draft[k] ?? "")} />)}</div>;
        break;
      default: control = <input aria-label={`${candidate.label} 입력`} autoFocus className={input} onChange={(e) => set({ [field]: e.target.value })} onKeyDown={onKey} placeholder={candidate.placeholder} value={String(draft[field] ?? "")} />;
    }
    return (
      <div className="mt-1 space-y-1.5 rounded-md bg-slate-50 p-2">
        {control}
        <div className="flex justify-end gap-1.5">
          <button className="rounded px-2 py-1 text-xs text-slate-600" onClick={() => setEditing(null)} type="button">취소</button>
          <button className="rounded bg-teal-700 px-2.5 py-1 text-xs font-bold text-white" disabled={saving} onClick={() => void save(candidate)} type="button">{saving ? "저장 중" : "저장"}</button>
        </div>
      </div>
    );
  }

  const canEditProfile = editable && profile?.canEdit !== false;
  const info = display.info;
  const setInfo = (next: DocumentInfoItem[]) => setDisplay({ info: next.slice(0, 24) });
  const updateItem = (key: string, patch: Partial<DocumentInfoItem>) => setInfo(info.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  // 11/4: 끌어서 순서·위치(위쪽/아래쪽) 바꾸기. 손가락(모바일)은 ↑↓·위/아래 버튼으로.
  function moveTo(key: string, place: "header" | "footer", beforeKey: string | null) {
    const item = info.find((x) => x.key === key);
    if (!item) return;
    const rest = info.filter((x) => x.key !== key);
    const moved = { ...item, place };
    const at = beforeKey ? rest.findIndex((x) => x.key === beforeKey) : -1;
    if (at < 0) {
      const lastOfPlace = rest.map((x) => x.place).lastIndexOf(place);
      rest.splice(lastOfPlace + 1, 0, moved);
    } else rest.splice(at, 0, moved);
    setInfo(rest);
  }
  function nudge(key: string, dir: -1 | 1) {
    const item = info.find((x) => x.key === key);
    if (!item) return;
    const same = info.filter((x) => x.place === item.place);
    const at = same.findIndex((x) => x.key === key);
    const target = same[at + dir];
    if (!target) return;
    if (dir === -1) moveTo(key, item.place, target.key);
    else { const after = same[at + 2]; moveTo(key, item.place, after ? after.key : null); }
  }
  function addCustom() {
    if (info.length >= 24) { setMessage("정보는 24줄까지 넣을 수 있습니다."); return; }
    const key = `custom:${Date.now().toString(36)}`;
    setInfo([...info, { key, label: "기타", value: "내용을 입력하세요", place: "footer" }]);
  }
  const zone = (place: "header" | "footer", title: string) => {
    const rows = info.filter((x) => x.place === place);
    return (
      <div
        className={`min-h-12 space-y-1 rounded-lg border border-dashed p-1.5 ${dragging ? "border-teal-400 bg-teal-50/40" : "border-slate-200"}`}
        onDragOver={(e) => { if (dragging) e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); if (dragging) moveTo(dragging, place, null); setDragging(null); }}
      >
        <p className="px-1 text-[11px] font-black text-teal-700">{title}</p>
        {rows.map((item) => (
          <div
            className="group flex items-start gap-1 rounded-md border border-slate-200 bg-white p-1.5"
            draggable={editable}
            key={item.key}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => { if (dragging && dragging !== item.key) e.preventDefault(); }}
            onDragStart={(e) => { setDragging(item.key); e.dataTransfer.effectAllowed = "move"; }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragging && dragging !== item.key) moveTo(dragging, place, item.key); setDragging(null); }}
          >
            <span aria-hidden className="cursor-grab select-none pt-1 text-slate-400">⠿</span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <input aria-label="정보 이름" className="w-full rounded border border-transparent px-1 text-xs font-bold hover:border-slate-200 focus:border-teal-500" disabled={!editable} maxLength={30} onChange={(e) => updateItem(item.key, { label: e.target.value })} value={item.label} />
              <input aria-label={`${item.label} 문서에 표시할 값`} className="w-full rounded border border-transparent px-1 text-xs text-slate-700 hover:border-slate-200 focus:border-teal-500" disabled={!editable} maxLength={200} onChange={(e) => updateItem(item.key, { value: e.target.value })} value={item.value} />
            </div>
            {editable ? (
              <div className="flex shrink-0 flex-col items-center text-[11px] text-slate-500">
                <button aria-label={`${item.label} 위로`} onClick={() => nudge(item.key, -1)} type="button">▲</button>
                <button aria-label={`${item.label} ${place === "header" ? "아래쪽으로" : "위쪽으로"} 옮기기`} className="font-bold text-teal-700" onClick={() => moveTo(item.key, place === "header" ? "footer" : "header", null)} type="button">{place === "header" ? "↓" : "↑"}</button>
                <button aria-label={`${item.label} 아래로`} onClick={() => nudge(item.key, 1)} type="button">▼</button>
              </div>
            ) : null}
            {editable ? <button aria-label={`${item.label} 빼기`} className="shrink-0 px-1 text-slate-400 hover:text-rose-600" onClick={() => setInfo(info.filter((x) => x.key !== item.key))} type="button">✕</button> : null}
          </div>
        ))}
        {!rows.length ? <p className="px-1 py-2 text-center text-[11px] text-slate-400">여기로 끌어 놓으세요</p> : null}
      </div>
    );
  };
  const available = candidates.filter((c) => !isOn(c.key));
  const library = (
    <div className="space-y-0.5">
      <p className="text-xs font-black text-slate-700">회사 정보에서 가져오기</p>
      {available.map((c) => (
        <div key={c.key}>
          <div className="flex min-h-7 items-center gap-2 text-xs">
            <span className={`shrink-0 font-semibold ${c.value ? "" : "text-slate-400"}`}>{c.label}</span>
            <span className="min-w-0 flex-1 truncate text-slate-500" title={c.value}>{c.value || "회사 정보에 없음"}</span>
            {editable && c.value ? <button className="shrink-0 font-bold text-teal-700" onClick={() => toggle(c, true)} type="button">+ 넣기</button> : null}
            {canEditProfile && !c.value && c.editor !== "none" && editing?.key !== c.key ? <button className="shrink-0 font-bold text-teal-700" onClick={() => { setMessage(""); setEditing({ key: c.key, draft: initialDraft(c, profile?.values || {}) }); }} type="button">+ 입력</button> : null}
          </div>
          {editing?.key === c.key ? editorFor(c) : null}
        </div>
      ))}
      {!available.length ? <p className="text-[11px] text-slate-400">회사 정보 항목을 모두 넣었습니다.</p> : null}
    </div>
  );

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`;

  return (
    <aside aria-label="보여줄 정보" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 xl:sticky xl:top-24">
      <div>
        <h2 className="text-sm font-black text-slate-900">보여줄 정보</h2>
        <p className="mt-0.5 text-xs text-slate-500">끌어서 위쪽·아래쪽과 순서를 바꾸세요. 문서에서 고친 값은 이 문서에만 쓰이고 회사 정보는 바뀌지 않습니다.</p>
      </div>
      {message ? <p className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" role="status">{message}</p> : null}
      {zone("header", "위쪽 — 회사명 아래")}
      {zone("footer", "아래쪽 — 주문·배송·결제")}
      {editable ? <button className="w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-bold text-slate-700" onClick={addCustom} type="button">+ 기타 정보 추가</button> : null}
      {profile === null ? <p className="text-xs text-slate-500">회사 정보를 불러오는 중입니다.</p> : library}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-black text-teal-700">품목 표</legend>
        <div className="flex flex-wrap gap-1.5">
          {([["showPrice", "단가"], ["showBrand", "브랜드"], ["showSpec", "규격·단위"]] as const).map(([key, label]) => (
            <button aria-pressed={content[key]} className={chip(content[key])} disabled={!editable} key={key} onClick={() => onContent({ ...content, [key]: !content[key] })} type="button">{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <span className="w-16">한 줄에</span>
          {([1, 2, 3] as const).map((n) => <button aria-pressed={display.columns === n} className={chip(display.columns === n)} disabled={!editable} key={n} onClick={() => setDisplay({ columns: n })} type="button">{n}열</button>)}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">품목 열 너비
          <input aria-label="품목 열 너비" className="min-w-0 flex-1" disabled={!editable} max="80" min="45" onChange={(event) => setDisplay({ productWidth: Number(event.target.value) })} type="range" value={display.productWidth} />
          <span>{display.productWidth}%</span>
        </label>
        <div className="flex items-center gap-2 text-xs text-slate-600">표시 단가
          {([false, true] as const).map((included) => <button aria-pressed={display.priceIncludesTax === included} className={chip(display.priceIncludesTax === included)} disabled={!editable} key={String(included)} onClick={() => setDisplay({ priceIncludesTax: included })} type="button">부가세 {included ? "포함" : "별도"}</button>)}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">과세·면세 표시
          {([false, true] as const).map((shown) => <button aria-pressed={display.showTaxType === shown} className={chip(display.showTaxType === shown)} disabled={!editable} key={String(shown)} onClick={() => setDisplay({ showTaxType: shown })} type="button">{shown ? "표시" : "숨김"}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <span className="w-16">형식</span>
          {([["auto", "자동"], ["table", "표"], ["cards", "카드"]] as const).map(([value, label]) => <button aria-pressed={content.layout === value} className={chip(content.layout === value)} disabled={!editable} key={value} onClick={() => onContent({ ...content, layout: value })} type="button">{label}</button>)}
        </div>
        {templates.length ? <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <span className="w-16">가격 기준</span>
          <select aria-label="가격 기준" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" disabled={!editable || basisBusy} onChange={(event) => void setBasis(event.target.value)} value={content.marginTemplateId ?? ""}>
            <option value="">기본</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label> : null}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <span className="w-16">행사 블록</span>
          {([["cards", "카드"], ["table", "표"]] as const).map(([value, label]) => <button aria-pressed={display.promoLayout === value} className={chip(display.promoLayout === value)} disabled={!editable} key={value} onClick={() => setDisplay({ promoLayout: value })} type="button">{label}</button>)}
        </div>
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <legend className="sr-only">디자인</legend>
        디자인
        {([["blue", "#1d4ed8", "청색"], ["green", "#047857", "녹색"], ["mono", "#1f2937", "흑백"]] as const).map(([value, color, label]) => (
          <button aria-label={label} aria-pressed={content.theme === value} className={`h-6 w-6 rounded-md ${content.theme === value ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} disabled={!editable} key={value} onClick={() => onContent({ ...content, theme: value })} style={{ background: color }} type="button" />
        ))}
      </fieldset>
    </aside>
  );
}
