"use client";

import { useEffect, useState } from "react";

type Region = { id: string; label: string };

export function SalesRegionSettings() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/leads/permits/keyword-search-regions", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok) setRegions(payload?.regions || []);
  };
  useEffect(() => { void load(); }, []);
  async function add() {
    setMessage("");
    const response = await fetch("/api/leads/permits/keyword-search-regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setMessage(payload?.message || "영업 지역을 저장하지 못했습니다.");
    setLabel(""); setMessage("영업 지역을 저장했습니다."); await load();
  }
  async function remove(id: string) {
    const response = await fetch(`/api/leads/permits/keyword-search-regions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) { setMessage("영업 지역을 삭제했습니다."); await load(); }
  }
  return <section className="maju-section-card p-5"><h2 className="text-lg font-black text-slate-950">영업 지역</h2><p className="mt-1 text-sm text-slate-500">정부·서울 신규 리드 수집과 카카오 연락처 보강을 적용할 시·군·구입니다. 저장된 값이 없으면 회사 출발지와 배송 권역을 기본으로 사용합니다.</p><div className="mt-4 flex gap-2"><input className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setLabel(event.target.value)} placeholder="예: 서울특별시 강남구" value={label} /><button className="maju-button-primary" disabled={!label.trim()} onClick={() => void add()} type="button">추가</button></div><div className="mt-3 flex flex-wrap gap-2">{regions.map((region) => <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800" key={region.id}>{region.label}<button aria-label={`${region.label} 삭제`} className="text-rose-600" onClick={() => void remove(region.id)} type="button">×</button></span>)}{!regions.length ? <span className="text-xs font-semibold text-slate-500">직접 지정한 지역 없음 · 출발지/배송 권역 기본값 사용</span> : null}</div>{message ? <p className="mt-3 text-xs font-bold text-slate-600">{message}</p> : null}</section>;
}
