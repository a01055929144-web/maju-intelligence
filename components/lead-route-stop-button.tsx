"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// CC-59: 리드 상세의 "가는 길에 넣기". 스위치(ROUTE_SALES_STOPS)가 꺼져 있으면 서버가 enabled:false를 줘 아무것도 그리지 않는다.
type Driver = { driverMemberId: string; name: string; stopCount: number; alreadyAdded: boolean; suggestion: { extraMinutes: number } | null };
type Day = "today" | "tomorrow";
const DAY_LABEL: Record<Day, string> = { today: "오늘", tomorrow: "내일" };

export function LeadRouteStopButton({ leadId }: { leadId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<Record<Day, Driver[]> | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setEnabled(false); setOpen(false); setDays(null); setMessage("");
    let alive = true;
    void fetchWithTimeout(`/api/leads/route-stops?leadId=${encodeURIComponent(leadId)}&date=today`, { cache: "no-store" }, 8000)
      .then((response) => (response.ok ? response.json() : null)).then((json: { enabled?: boolean } | null) => { if (alive) setEnabled(json?.enabled === true); }).catch(() => undefined);
    return () => { alive = false; };
  }, [leadId]);

  async function load() {
    setOpen(true); setMessage("");
    const read = async (day: Day) => {
      const response = await fetchWithTimeout(`/api/leads/route-stops?leadId=${encodeURIComponent(leadId)}&date=${day}`, { cache: "no-store" }, 12000);
      if (!response.ok) throw new Error("read");
      return ((await response.json()) as { drivers: Driver[] }).drivers;
    };
    try { setDays({ today: await read("today"), tomorrow: await read("tomorrow") }); } catch { setMessage("배송 경로를 불러오지 못했습니다."); }
  }

  async function add(day: Day, driver: Driver) {
    setMessage("넣는 중…");
    const response = await fetchWithTimeout("/api/leads/route-stops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, date: day, driverMemberId: driver.driverMemberId }) }, 15000).catch(() => null);
    const json = response ? ((await response.json().catch(() => ({}))) as { message?: string; extraMinutes?: number }) : {};
    if (response?.ok) { setMessage(`${DAY_LABEL[day]} ${driver.name} 경로에 넣었습니다 (+${json.extraMinutes ?? "?"}분)`); void load(); return; }
    setMessage(json.message || "경로에 넣지 못했습니다.");
  }

  if (!enabled) return null;
  return (
    <div className="mt-2 text-xs font-bold">
      <button className="maju-button-secondary h-8 px-3 text-xs" onClick={() => (open ? setOpen(false) : void load())} type="button">가는 길에 넣기</button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white p-2" role="group" aria-label="가는 길에 넣기">
          {(["today", "tomorrow"] as const).map((day) => (
            <div key={day}>
              <p className="text-slate-700">{DAY_LABEL[day]}</p>
              {!days ? <p className="text-slate-500">불러오는 중…</p> : days[day].length === 0 ? <p className="text-slate-500">배송 경로가 없습니다.</p> : days[day].map((driver) => (
                <div className="flex items-center justify-between gap-2 py-1" key={driver.driverMemberId}>
                  <span className="min-w-0 truncate">{driver.name} · 정류장 {driver.stopCount}곳{driver.suggestion ? ` · +${driver.suggestion.extraMinutes}분` : " · 위치를 몰라 자리 계산 불가"}</span>
                  <button className="maju-button-secondary h-8 shrink-0 px-3 text-xs" disabled={driver.alreadyAdded || !driver.suggestion} onClick={() => void add(day, driver)} type="button">{driver.alreadyAdded ? "들어 있음" : "넣기"}</button>
                </div>
              ))}
            </div>
          ))}
          {message ? <p aria-live="polite" className="text-slate-600">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
