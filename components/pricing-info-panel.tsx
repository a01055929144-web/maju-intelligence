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
  const [message, setMessage] = useState("");
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

  // 회사 정보가 바뀌었으면 문서에 넣어 둔 줄도 최신 값으로, 회사명이 비어 있으면 회사 정보 이름으로 채웁니다.
  useEffect(() => {
    if (!profile || !editable) return;
    const current = latest.current;
    const info = (current.display || DEFAULT_DISPLAY).info;
    const byKey = new Map(buildInfoCandidates(profile).map((c) => [c.key, c]));
    let changed = false;
    const nextInfo = info.flatMap((item) => {
      const fresh = byKey.get(item.key);
      if (!fresh) return [item];
      if (!fresh.value) { changed = true; return []; }
      if (fresh.value !== item.value) { changed = true; return [{ ...item, value: fresh.value }]; }
      return [item];
    });
    const name = !current.companyName.trim() && profile.company?.name ? profile.company.name.slice(0, 100) : "";
    if (changed || name) onContent({ ...current, ...(name ? { companyName: name } : {}), display: { ...(current.display || DEFAULT_DISPLAY), info: nextInfo } });
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
    setMessage(`${candidate.label}을(를) 회사 정보에도 저장했습니다.`);
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
  const group = (place: "header" | "footer", title: string) => (
    <fieldset className="space-y-0.5">
      <legend className="mb-1 text-xs font-black text-teal-700">{title}</legend>
      {candidates.filter((c) => c.place === place).map((c) => (
        <div key={c.key}>
          <div className="flex min-h-8 items-center gap-2 text-sm">
            <label className={`flex min-w-0 flex-1 items-center gap-2 ${c.value ? "" : "text-slate-400"}`}>
              <input checked={isOn(c.key)} disabled={!editable || !c.value} onChange={(e) => toggle(c, e.target.checked)} type="checkbox" />
              <span className="shrink-0">{c.label}</span>
              {c.value ? <span className="min-w-0 truncate text-xs text-slate-500" title={c.value}>{c.value}</span> : null}
            </label>
            {canEditProfile && c.editor !== "none" && editing?.key !== c.key ? (
              <button className="shrink-0 text-xs font-bold text-teal-700" onClick={() => { setMessage(""); setEditing({ key: c.key, draft: initialDraft(c, profile?.values || {}) }); }} type="button">{c.value ? "수정" : "+ 입력"}</button>
            ) : null}
          </div>
          {editing?.key === c.key ? editorFor(c) : null}
        </div>
      ))}
    </fieldset>
  );

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`;

  return (
    <aside aria-label="보여줄 정보" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 xl:sticky xl:top-24">
      <div>
        <h2 className="text-sm font-black text-slate-900">보여줄 정보</h2>
        <p className="mt-0.5 text-xs text-slate-500">회사 정보에서 가져옵니다. 여기서 입력·수정하면 회사 정보에도 바로 저장됩니다.</p>
      </div>
      {message ? <p className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" role="status">{message}</p> : null}
      {profile === null ? <p className="text-xs text-slate-500">회사 정보를 불러오는 중입니다.</p> : <>{group("header", "위쪽 (회사 정보)")}{group("footer", "아래쪽 (주문·배송·결제)")}</>}
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
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          <span className="w-16">형식</span>
          {([["auto", "자동"], ["table", "표"], ["cards", "카드"]] as const).map(([value, label]) => <button aria-pressed={content.layout === value} className={chip(content.layout === value)} disabled={!editable} key={value} onClick={() => onContent({ ...content, layout: value })} type="button">{label}</button>)}
        </div>
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
