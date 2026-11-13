"use client";
import { useState } from "react";

// CC-23: 유통사 탭 "카카오에서 찾기" 서랍. 검색 결과는 보여 주기만 하고, 사람이 고르고 확인한 값만 저장한다(약관 보수 해석).
type Candidate = { kakaoPlaceUrl: string; name: string; address: string; phone: string; categoryName: string; duplicate: { id?: string; reason: "place" | "phone" | "name_address" } | null };
type Pick = { kakaoPlaceUrl: string; name: string; address: string; phone: string };
const CHIPS = ["식자재 유통", "식자재 도매", "축산 도매", "수산 도매", "식품 납품"];
const REASON = { place: "같은 카카오 장소", phone: "같은 번호", name_address: "같은 상호·주소" } as const;
const field = "h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm";

export function DistributorKakaoDrawer({ buildUrl, onAdded, onClose }: { buildUrl: (path: string) => string; onAdded: () => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function search(nextPage: number, text = q) {
    if (text.trim().length < 2) { setError("검색어를 2글자 이상 입력하세요."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(buildUrl(`/api/leads/distributors/kakao?${new URLSearchParams({ q: text.trim(), region: region.trim(), page: String(nextPage) })}`), { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "검색하지 못했습니다.");
      setResults((previous) => (nextPage === 1 ? body.results : [...previous, ...body.results]));
      setPage(nextPage);
      if (!body.results.length && nextPage === 1) setMessage("검색 결과가 없습니다. 검색어나 지역을 바꿔 보세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "검색하지 못했습니다."); }
    finally { setBusy(false); }
  }
  function toggle(c: Candidate, on: boolean) {
    setPicked((previous) => {
      const next = { ...previous };
      if (on) next[c.kakaoPlaceUrl] = { kakaoPlaceUrl: c.kakaoPlaceUrl, name: c.name, address: c.address, phone: c.phone }; else delete next[c.kakaoPlaceUrl];
      return next;
    });
  }
  const edit = (key: string, patch: Partial<Pick>) => setPicked((previous) => ({ ...previous, [key]: { ...previous[key], ...patch } }));

  async function add() {
    const items = Object.values(picked);
    if (!items.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(buildUrl("/api/leads/distributors/kakao"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "추가하지 못했습니다.");
      setMessage(`${body.created}곳을 추가했습니다.${body.skipped?.length ? ` 이미 있어서 건너뜀 ${body.skipped.length}곳.` : ""}`);
      setPicked({});
      onAdded();
      await search(1);
    } catch (e) { setError(e instanceof Error ? e.message : "추가하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
    <div aria-label="카카오에서 유통사 찾기" aria-modal="true" className="h-full w-full max-w-lg space-y-3 overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black">카카오에서 유통사 찾기</h2>
        <button className="min-h-[44px] rounded-lg border px-4 text-sm font-bold" onClick={onClose} type="button">닫기</button>
      </div>
      <p className="text-xs text-slate-600">검색 결과는 저장하지 않습니다. 고른 업체의 상호·주소·번호(아래에서 확인·수정한 값)와 카카오 장소 링크만 리드로 저장하고, 좌표는 저장하지 않습니다. 연락은 1:1 개별 연락만 합니다.</p>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void search(1); }}>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-bold">검색어<input aria-label="검색어" className={`${field} mt-1`} maxLength={60} onChange={(e) => setQ(e.target.value)} placeholder="상호 또는 키워드" value={q} /></label>
          <label className="text-sm font-bold">지역(선택)<input aria-label="지역" className={`${field} mt-1`} maxLength={30} onChange={(e) => setRegion(e.target.value)} placeholder="예: 서울 강남구" value={region} /></label>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="빠른 키워드">
          {CHIPS.map((chip) => <button className="min-h-[36px] rounded-full border border-slate-200 px-3 text-xs font-bold text-slate-700" key={chip} onClick={() => { setQ(chip); void search(1, chip); }} type="button">{chip}</button>)}
        </div>
        <button className="maju-button-primary min-h-[44px] px-4" disabled={busy} type="submit">검색</button>
      </form>
      {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p> : null}
      {message ? <p className="rounded border border-teal-300 bg-teal-50 p-2 text-sm text-teal-900" role="status">{message}</p> : null}
      <ul aria-label="검색 결과" className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {results.map((c) => <li className="flex items-start gap-2 p-2" key={c.kakaoPlaceUrl}>
          <input aria-label={`${c.name} 선택`} checked={Boolean(picked[c.kakaoPlaceUrl])} className="mt-2 h-5 w-5" disabled={Boolean(c.duplicate) || busy} onChange={(e) => toggle(c, e.target.checked)} type="checkbox" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">{c.name}{c.duplicate ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800">이미 있음 · {REASON[c.duplicate.reason]}</span> : null}</p>
            <p className="break-words text-slate-600">{c.address || "주소 없음"} · {c.phone || "번호 없음"}</p>
            {c.categoryName ? <p className="text-xs text-slate-500">{c.categoryName}</p> : null}
            <a className="text-xs font-bold text-teal-800 underline" href={c.kakaoPlaceUrl} rel="noreferrer" target="_blank">카카오맵에서 보기</a>
          </div>
        </li>)}
      </ul>
      {results.length && page < 3 ? <button className="min-h-[44px] rounded-lg border px-4 text-sm font-bold" disabled={busy} onClick={() => void search(page + 1)} type="button">더 보기</button> : null}
      {Object.keys(picked).length ? <div className="space-y-2 border-t pt-3" aria-label="추가 전 확인">
        <p className="text-sm font-bold">추가 전 확인 · {Object.keys(picked).length}곳 (값을 고쳐도 됩니다)</p>
        {Object.values(picked).map((p) => <div className="grid grid-cols-1 gap-1 rounded border border-slate-200 p-2 sm:grid-cols-3" key={p.kakaoPlaceUrl}>
          <input aria-label="상호" className={field} maxLength={300} onChange={(e) => edit(p.kakaoPlaceUrl, { name: e.target.value })} value={p.name} />
          <input aria-label="주소" className={field} maxLength={300} onChange={(e) => edit(p.kakaoPlaceUrl, { address: e.target.value })} value={p.address} />
          <input aria-label="전화" className={field} maxLength={30} onChange={(e) => edit(p.kakaoPlaceUrl, { phone: e.target.value })} value={p.phone} />
        </div>)}
        <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || Object.values(picked).some((p) => !p.name.trim())} onClick={() => void add()} type="button">{Object.keys(picked).length}곳 추가</button>
      </div> : null}
    </div>
  </div>;
}
