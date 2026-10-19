"use client";

import { useEffect, useState } from "react";

type Region = { id: string; label: string };
type SalesAreaState = {
  defaultAreas: string[];
  effectiveAreas: string[];
  explicitAreas: string[];
  source: "default" | "explicit" | "none";
  unrecognizedRegions: Region[];
};

const PROVINCES = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시",
  "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도",
  "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도"
];

export function SalesRegionSettings() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [province, setProvince] = useState("서울특별시");
  const [district, setDistrict] = useState("");
  const [salesAreaState, setSalesAreaState] = useState<SalesAreaState>({ defaultAreas: [], effectiveAreas: [], explicitAreas: [], source: "none", unrecognizedRegions: [] });
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/leads/permits/keyword-search-regions", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setRegions(payload?.regions || []);
      setSalesAreaState(payload?.salesAreaState || { defaultAreas: [], effectiveAreas: [], explicitAreas: [], source: "none", unrecognizedRegions: [] });
    }
  };
  useEffect(() => { void load(); }, []);
  async function add() {
    setMessage("");
    const label = district.trim().includes(" ") ? district.trim() : `${province} ${district.trim()}`;
    const response = await fetch("/api/leads/permits/keyword-search-regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setMessage(payload?.message || "영업 지역을 저장하지 못했습니다.");
    setDistrict(""); setMessage("영업 지역을 저장했습니다."); await load();
  }
  async function remove(id: string) {
    const response = await fetch(`/api/leads/permits/keyword-search-regions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) { setMessage("영업 지역을 삭제했습니다."); await load(); }
  }
  const sourceLabel = salesAreaState.source === "explicit"
    ? "직접 지정"
    : salesAreaState.source === "default"
      ? "출발지·배송 권역 기본값"
      : "미설정";

  return (
    <section className="maju-section-card p-5">
      <h2 className="text-lg font-black text-slate-950">영업 지역</h2>
      <p className="mt-1 text-sm text-slate-500">
        정부·서울 신규 리드 수집, 카카오 연락처 보강, 영업 리드 키워드 검색에 함께 적용되는 시·군·구입니다.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <select className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold" onChange={(event) => setProvince(event.target.value)} value={province}>
          {PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setDistrict(event.target.value)} placeholder="시·군·구 (예: 강남구)" value={district} />
        <button className="maju-button-primary" disabled={!district.trim()} onClick={() => void add()} type="button">추가</button>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-700">현재 적용 중인 영업 지역 · {sourceLabel}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {salesAreaState.effectiveAreas.map((area) => <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-800 ring-1 ring-slate-200" key={area}>{area}</span>)}
          {!salesAreaState.effectiveAreas.length ? <span className="text-xs font-semibold text-amber-700">적용 가능한 지역이 없습니다.</span> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {regions.map((region) => {
          const unrecognized = salesAreaState.unrecognizedRegions.some((item) => item.id === region.id);
          return (
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${unrecognized ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800"}`} key={region.id}>
              {region.label}{unrecognized ? " · 인식 안 됨" : ""}
              <button aria-label={`${region.label} 삭제`} className="text-rose-600" onClick={() => void remove(region.id)} type="button">×</button>
            </span>
          );
        })}
        {!regions.length ? <span className="text-xs font-semibold text-slate-500">직접 지정한 지역 없음 · 출발지/배송 권역 기본값 사용</span> : null}
      </div>
      {message ? <p className="mt-3 text-xs font-bold text-slate-600">{message}</p> : null}
    </section>
  );
}
