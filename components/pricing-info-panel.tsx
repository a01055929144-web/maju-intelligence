"use client";

import { useEffect, useState } from "react";
import type { DocumentContent, DocumentInfoItem } from "@/domains/pricing/document";
import { DEFAULT_DISPLAY } from "@/domains/pricing/document";

type Profile = { company?: { businessRegistrationNumber?: string }; values?: Record<string, unknown> };
type Candidate = { key: string; label: string; place: "header" | "footer"; value: string; addable?: boolean };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** 회사 정보 값 → 문서에 넣을 수 있는 줄 목록 */
export function buildInfoCandidates(profile: Profile): Candidate[] {
  const v = profile.values || {};
  const days = Array.isArray(v.delivery_weekdays) ? (v.delivery_weekdays as number[]).filter((d) => d >= 0 && d <= 6).sort().map((d) => WEEKDAYS[d]).join("·") : "";
  const cutoff = text(v.next_day_cutoff_time).slice(0, 5);
  const minimum = typeof v.first_order_minimum_won === "number" && v.first_order_minimum_won > 0 ? `${v.first_order_minimum_won.toLocaleString()}원` : "";
  const account = [text(v.settlement_bank), text(v.settlement_account_number), text(v.settlement_account_holder)].filter(Boolean).join(" ");
  const methods = Array.isArray(v.payment_methods) ? (v.payment_methods as string[]).join("·") : "";
  return [
    { key: "main_phone", label: "대표 연락처", place: "header", value: text(v.main_phone) },
    { key: "business_number", label: "사업자번호", place: "header", value: text(profile.company?.businessRegistrationNumber) },
    { key: "business_address", label: "주소", place: "header", value: [text(v.business_address), text(v.business_address_detail)].filter(Boolean).join(" ") },
    { addable: true, key: "fax", label: "팩스", place: "header", value: text(v.fax) },
    { addable: true, key: "email", label: "이메일", place: "header", value: text(v.email) },
    { addable: true, key: "consult_hours", label: "상담 시간", place: "header", value: text(v.consult_hours) },
    { key: "next_day_cutoff_time", label: "주문 마감", place: "footer", value: cutoff ? `전날 ${cutoff}` : "" },
    { key: "delivery_weekdays", label: "배송 요일", place: "footer", value: days },
    { addable: true, key: "delivery_time_window", label: "배송 시간", place: "footer", value: text(v.delivery_time_window) },
    { key: "first_order_minimum_won", label: "최소 주문", place: "footer", value: minimum },
    { key: "payment_cycle", label: "결제 조건", place: "footer", value: text(v.payment_cycle) },
    { key: "payment_methods", label: "결제 방식", place: "footer", value: methods },
    { key: "settlement_account", label: "입금 계좌", place: "footer", value: account }
  ];
}

/**
 * 11/4: 오른쪽 '보여줄 정보' — 문서 설정 입력 대신 회사 정보에서 골라 넣고 빼기(시안 ①).
 * 값이 없는 칸은 그 자리에서 입력해 회사 정보에도 저장합니다(간단한 글자 칸만). 나머지는 회사 정보로 이동.
 */
export function PricingInfoPanel({ companyId, content, editable, onContent }: {
  readonly companyId: string;
  readonly content: DocumentContent;
  readonly editable: boolean;
  readonly onContent: (content: DocumentContent) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [adding, setAdding] = useState<{ key: string; value: string } | null>(null);
  const [message, setMessage] = useState("");
  const display = content.display || DEFAULT_DISPLAY;

  useEffect(() => {
    let active = true;
    void fetch(`/api/company-profile?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: Profile | null) => { if (active) setProfile(payload || {}); })
      .catch(() => { if (active) setProfile({}); });
    return () => { active = false; };
  }, [companyId]);

  const candidates = profile ? buildInfoCandidates(profile) : [];
  const setDisplay = (patch: Partial<typeof display>) => onContent({ ...content, display: { ...display, ...patch } });
  const isOn = (key: string) => display.info.some((item) => item.key === key);

  function toggle(candidate: Candidate, on: boolean) {
    const rest = display.info.filter((item) => item.key !== candidate.key);
    const item: DocumentInfoItem = { key: candidate.key, label: candidate.label, place: candidate.place, value: candidate.value };
    setDisplay({ info: on ? [...rest, item] : rest });
  }

  async function saveMissing() {
    if (!adding?.value.trim()) return;
    const response = await fetch("/api/company-profile", { body: JSON.stringify({ companyId, values: { [adding.key]: adding.value.trim() } }), headers: { "Content-Type": "application/json" }, method: "PUT" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as (Profile & { message?: string }) | null;
    if (!response?.ok || !payload) { setMessage(payload?.message || "회사 정보에 저장하지 못했습니다."); return; }
    setProfile(payload);
    const candidate = buildInfoCandidates(payload).find((item) => item.key === adding.key);
    if (candidate?.value) toggle(candidate, true);
    setAdding(null);
    setMessage("회사 정보에도 저장했습니다.");
  }

  const group = (place: "header" | "footer", title: string) => (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-xs font-black text-teal-700">{title}</legend>
      {candidates.filter((c) => c.place === place).map((c) => (
        <div className="flex min-h-8 items-center gap-2 text-sm" key={c.key}>
          <label className={`flex min-w-0 flex-1 items-center gap-2 ${c.value ? "" : "text-slate-400"}`}>
            <input checked={isOn(c.key)} disabled={!editable || !c.value} onChange={(e) => toggle(c, e.target.checked)} type="checkbox" />
            <span className="shrink-0">{c.label}</span>
            {c.value ? <span className="min-w-0 truncate text-xs text-slate-500" title={c.value}>{c.value}</span> : null}
          </label>
          {!c.value && editable ? (
            c.addable ? (
              adding?.key === c.key ? (
                <span className="flex items-center gap-1">
                  <input aria-label={`${c.label} 입력`} autoFocus className="h-7 w-28 rounded border border-slate-300 px-1.5 text-xs" onChange={(e) => setAdding({ key: c.key, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void saveMissing(); if (e.key === "Escape") setAdding(null); }} value={adding.value} />
                  <button className="text-xs font-bold text-teal-700" onClick={() => void saveMissing()} type="button">저장</button>
                </span>
              ) : (
                <button className="shrink-0 text-xs font-bold text-teal-700" onClick={() => setAdding({ key: c.key, value: "" })} type="button">+ 추가</button>
              )
            ) : (
              <a className="shrink-0 text-xs font-bold text-teal-700" href="/dashboard/settings/company">회사 정보에서 입력</a>
            )
          ) : null}
        </div>
      ))}
    </fieldset>
  );

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs font-bold ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`;

  return (
    <aside aria-label="보여줄 정보" className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 xl:sticky xl:top-24">
      <div>
        <h2 className="text-sm font-black text-slate-900">보여줄 정보</h2>
        <p className="mt-0.5 text-xs text-slate-500">회사 정보에서 가져옵니다. 체크로 넣고 빼세요.</p>
      </div>
      {profile === null ? <p className="text-xs text-slate-500">회사 정보를 불러오는 중입니다.</p> : <>{group("header", "위쪽")}{group("footer", "아래쪽 (주문·배송·결제)")}</>}
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
      {message ? <p className="text-xs font-bold text-slate-600">{message}</p> : null}
    </aside>
  );
}
