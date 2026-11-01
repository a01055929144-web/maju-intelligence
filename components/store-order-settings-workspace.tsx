"use client";

import { useCallback, useEffect, useState } from "react";

type Rule = {
  delivery_weekdays?: number[] | null;
  cutoff_days_before?: number | null;
  cutoff_time?: string | null;
  minimum_amount?: number | null;
  minimum_policy?: "block" | "fee" | "notice" | null;
  delivery_fee?: number | null;
};
type Territory = { id: string; name: string; is_active: boolean };
type Customer = { id: string; customer_name: string; delivery_territory_id: string | null };
type Holiday = { id: string; territory_id: string | null; kind: "weekly" | "fixed" | "date";
  weekday: number | null; month: number | null; day: number | null; holiday_date: string | null; label: string };
type SettingsResponse = { settings: Rule & { notice?: string; market_price_notice?: string } | null;
  territories: Territory[]; territoryRules: (Rule & { territory_id: string })[];
  holidays: Holiday[] };
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const defaultRule: Rule = { delivery_weekdays: [1, 2, 3, 4, 5, 6], cutoff_days_before: 1,
  cutoff_time: "22:00", minimum_amount: 0, minimum_policy: "notice", delivery_fee: 0 };

function numberOrNull(value: string) { return value === "" ? null : Number(value); }

function PolicyFields({ value, onChange, inherit = false }: {
  value: Rule; onChange: (next: Rule) => void; inherit?: boolean;
}) {
  const weekdays = value.delivery_weekdays ?? [];
  return <div className="grid gap-3 md:grid-cols-3">
    <fieldset className="md:col-span-3">
      <legend className="mb-1 text-sm font-semibold">배송 요일</legend>
      {inherit && <button className="mr-2 rounded border px-3 py-2 text-sm" type="button"
        onClick={() => onChange({ ...value, delivery_weekdays: null })}>권역 값 사용</button>}
      <div className="inline-flex flex-wrap gap-1">
        {DAYS.map((label, day) => <label key={day} className="flex min-h-11 items-center gap-1 rounded border px-3 text-sm">
          <input type="checkbox" checked={weekdays.includes(day)} onChange={() => {
            const next = weekdays.includes(day) ? weekdays.filter((item) => item !== day) : [...weekdays, day].sort();
            onChange({ ...value, delivery_weekdays: next });
          }} />{label}</label>)}
      </div>
    </fieldset>
    <label className="text-sm">마감일
      <select className="mt-1 w-full rounded border p-2" value={value.cutoff_days_before ?? ""}
        onChange={(event) => onChange({ ...value, cutoff_days_before: numberOrNull(event.target.value) })}>
        {inherit && <option value="">상위 설정 사용</option>}
        <option value="0">배송 당일</option><option value="1">전날</option><option value="2">2일 전</option>
      </select>
    </label>
    <label className="text-sm">마감 시각
      <input className="mt-1 w-full rounded border p-2" type="time" value={value.cutoff_time ?? ""}
        onChange={(event) => onChange({ ...value, cutoff_time: event.target.value || null })} />
    </label>
    <label className="text-sm">최소 주문금액 (원)
      <input className="mt-1 w-full rounded border p-2" type="number" min="0" value={value.minimum_amount ?? ""}
        onChange={(event) => onChange({ ...value, minimum_amount: numberOrNull(event.target.value) })} />
    </label>
    <label className="text-sm">최소 주문 미달 시
      <select className="mt-1 w-full rounded border p-2" value={value.minimum_policy ?? ""}
        onChange={(event) => onChange({ ...value, minimum_policy: event.target.value as Rule["minimum_policy"] })}>
        {inherit && <option value="">상위 설정 사용</option>}
        <option value="block">주문 막기</option><option value="fee">배송비 받고 주문</option>
        <option value="notice">안내만</option>
      </select>
    </label>
    <label className="text-sm">배송비 (원)
      <input className="mt-1 w-full rounded border p-2" type="number" min="0" value={value.delivery_fee ?? ""}
        onChange={(event) => onChange({ ...value, delivery_fee: numberOrNull(event.target.value) })} />
    </label>
  </div>;
}

export function StoreOrderSettingsWorkspace({ companyId }: { companyId: string }) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [company, setCompany] = useState<Rule & { notice: string; marketPriceNotice: string }>({
    ...defaultRule, notice: "", marketPriceNotice: "싯가·경매가에 따라 달라질 수 있습니다." });
  const [territoryId, setTerritoryId] = useState("");
  const [territoryRule, setTerritoryRule] = useState<Rule>(defaultRule);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerRule, setCustomerRule] = useState<Rule>({ delivery_weekdays: null,
    cutoff_days_before: null, cutoff_time: null, minimum_amount: null,
    minimum_policy: null, delivery_fee: null });
  const [holiday, setHoliday] = useState({ kind: "date", date: "", weekday: 0,
    month: 1, day: 1, territoryId: "", label: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const url = `/api/pricing-order-settings?companyId=${encodeURIComponent(companyId)}`;
  const load = useCallback(async () => {
    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json() as SettingsResponse & { message?: string };
    if (!response.ok) throw new Error(result.message || "주문 설정을 불러오지 못했습니다.");
    setData(result);
    if (result.settings) setCompany({
      ...result.settings, notice: result.settings.notice ?? "",
      marketPriceNotice: result.settings.market_price_notice ?? "",
    });
  }, [url]);
  useEffect(() => { void load().catch((error) => setMessage(String(error))); }, [load]);
  useEffect(() => {
    if (!data || !territoryId) return;
    setTerritoryRule(data.territoryRules.find((item) => item.territory_id === territoryId) ?? defaultRule);
  }, [data, territoryId]);
  useEffect(() => {
    if (!data || !customerId) return;
    const empty: Rule = {
      delivery_weekdays: null, cutoff_days_before: null, cutoff_time: null,
      minimum_amount: null, minimum_policy: null, delivery_fee: null };
    void fetch(`${url}&customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" })
      .then((response) => response.json()).then((result: { rule?: Rule | null }) =>
        setCustomerRule(result.rule ?? empty))
      .catch(() => setMessage("매장별 예외를 불러오지 못했습니다."));
  }, [data, customerId, url]);
  async function save(body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/pricing-order-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...body }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "저장하지 못했습니다.");
      await load(); setMessage("저장되었습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function searchCustomers() {
    setMessage("");
    try {
      const response = await fetch(`${url}&customerQuery=${encodeURIComponent(customerQuery)}`, { cache: "no-store" });
      const result = await response.json() as { customers?: Customer[]; message?: string };
      if (!response.ok) throw new Error(result.message || "거래처를 찾지 못했습니다.");
      setCustomers(result.customers ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "거래처를 찾지 못했습니다."); }
  }
  async function removeHoliday(id: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${url}&holidayId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("휴일을 삭제하지 못했습니다.");
      await load(); setMessage("휴일을 삭제했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "휴일을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <header><h1 className="text-xl font-semibold">주문 설정</h1>
      <p className="text-sm text-slate-600">회사 기본값보다 권역, 권역보다 매장별 예외가 우선합니다. 이번 단계는 후결제 주문만 받습니다.</p></header>
    {message && <p role="status" className="rounded border border-slate-300 p-3 text-sm">{message}</p>}
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">회사 기본값</h2>
      <PolicyFields value={company} onChange={(rule) => setCompany({ ...company, ...rule })} />
      <label className="block text-sm">매장 공지<textarea className="mt-1 w-full rounded border p-2" value={company.notice}
        onChange={(event) => setCompany({ ...company, notice: event.target.value })} /></label>
      <label className="block text-sm">시세 품목 안내<textarea className="mt-1 w-full rounded border p-2" value={company.marketPriceNotice}
        onChange={(event) => setCompany({ ...company, marketPriceNotice: event.target.value })} /></label>
      <button type="button" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void save({
        action: "company", ...{
          cutoffDaysBefore: company.cutoff_days_before, cutoffTime: company.cutoff_time,
          minimumAmount: company.minimum_amount, minimumPolicy: company.minimum_policy,
          deliveryFee: company.delivery_fee,
        }, notice: company.notice, marketPriceNotice: company.marketPriceNotice,
      })}>회사 설정 저장</button>
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">권역별 배송</h2>
      <select aria-label="배송 권역" className="w-full rounded border p-2" value={territoryId}
        onChange={(event) => setTerritoryId(event.target.value)}><option value="">권역 선택</option>
        {data?.territories.filter((item) => item.is_active).map((item) =>
          <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      {territoryId && <><PolicyFields value={territoryRule} onChange={setTerritoryRule} />
        <button type="button" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white"
          onClick={() => void save({ action: "territory", territoryId,
            weekdays: territoryRule.delivery_weekdays, cutoffDaysBefore: territoryRule.cutoff_days_before,
            cutoffTime: territoryRule.cutoff_time, minimumAmount: territoryRule.minimum_amount,
            minimumPolicy: territoryRule.minimum_policy, deliveryFee: territoryRule.delivery_fee })}>권역 저장</button></>}
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">매장별 예외</h2>
      <div className="flex gap-2"><input aria-label="거래처 이름 검색" className="min-w-0 flex-1 rounded border p-2" value={customerQuery}
        onChange={(event) => setCustomerQuery(event.target.value)} placeholder="거래처 이름 검색" />
        <button type="button" className="rounded border px-4" onClick={() => void searchCustomers()}>검색</button></div>
      <select aria-label="거래처 선택" className="w-full rounded border p-2" value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}><option value="">거래처 선택</option>
        {customers.map((item) => <option key={item.id} value={item.id}>{item.customer_name}</option>)}</select>
      {customerId && <><PolicyFields value={customerRule} onChange={setCustomerRule} inherit />
        <button type="button" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white"
          onClick={() => void save({ action: "customer", customerId,
            weekdays: customerRule.delivery_weekdays, cutoffDaysBefore: customerRule.cutoff_days_before,
            cutoffTime: customerRule.cutoff_time, minimumAmount: customerRule.minimum_amount,
            minimumPolicy: customerRule.minimum_policy, deliveryFee: customerRule.delivery_fee })}>매장 예외 저장</button></>}
    </section>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">휴일</h2>
      <div className="grid gap-2 md:grid-cols-3">
        <select aria-label="휴일 종류" className="rounded border p-2" value={holiday.kind}
          onChange={(event) => setHoliday({ ...holiday, kind: event.target.value })}>
          <option value="date">지정 날짜</option><option value="weekly">매주</option><option value="fixed">매년 고정</option></select>
        <select aria-label="휴일 권역" className="rounded border p-2" value={holiday.territoryId}
          onChange={(event) => setHoliday({ ...holiday, territoryId: event.target.value })}>
          <option value="">모든 권역</option>{data?.territories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        {holiday.kind === "date" ? <input aria-label="휴일 날짜" type="date" className="rounded border p-2" value={holiday.date}
          onChange={(event) => setHoliday({ ...holiday, date: event.target.value })} /> : holiday.kind === "weekly" ?
          <select aria-label="휴일 요일" className="rounded border p-2" value={holiday.weekday}
            onChange={(event) => setHoliday({ ...holiday, weekday: Number(event.target.value) })}>
            {DAYS.map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select> :
          <div className="flex gap-2"><input aria-label="휴일 월" type="number" min="1" max="12" className="w-1/2 rounded border p-2"
            value={holiday.month} onChange={(event) => setHoliday({ ...holiday, month: Number(event.target.value) })} />
            <input aria-label="휴일 일" type="number" min="1" max="31" className="w-1/2 rounded border p-2"
              value={holiday.day} onChange={(event) => setHoliday({ ...holiday, day: Number(event.target.value) })} /></div>}
      </div>
      <input aria-label="휴일 이름" className="w-full rounded border p-2" value={holiday.label} placeholder="휴일 이름"
        onChange={(event) => setHoliday({ ...holiday, label: event.target.value })} />
      <button type="button" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white"
        onClick={() => void save({ action: "holiday", ...holiday })}>휴일 추가</button>
      <ul className="divide-y">{data?.holidays.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>{item.label || "휴일"} · {item.kind === "date" ? item.holiday_date : item.kind === "weekly"
          ? `매주 ${DAYS[item.weekday ?? 0]}요일` : `매년 ${item.month}/${item.day}`}</span>
        <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => void removeHoliday(item.id)}>삭제</button>
      </li>)}</ul>
    </section>
  </div>;
}
