"use client";

import { useState } from "react";

type Candidate = { customerId: string; customerName: string; addressHint: string };

/** CX-146 확인 화면: 내 매장이 맞는 것만 체크한 채 [연결하기], 아니면 [내 매장이 아님](연결하지 않고 고객사에 알림). */
export function StorePhoneLinkConfirm({ candidates }: { candidates: Candidate[] }) {
  const [checked, setChecked] = useState(() => new Set(candidates.map(candidate => candidate.customerId)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(action: "confirm" | "decline") {
    const customerIds = action === "confirm" ? Array.from(checked) : candidates.map(candidate => candidate.customerId);
    if (!customerIds.length) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/store/phone-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, customerIds }) });
      if (!response.ok) { setMessage("처리하지 못했습니다. 잠시 후 다시 시도해 주세요."); setBusy(false); return; }
      window.location.assign("/store");
    } catch { setMessage("처리하지 못했습니다. 잠시 후 다시 시도해 주세요."); setBusy(false); }
  }
  return <section aria-label="내 매장 확인" className="space-y-4">
    <header><h1 className="text-xl font-semibold">내 매장이 맞나요?</h1>
      <p className="mt-1 text-sm text-slate-600">고객사가 등록해 둔 점주 휴대폰이 이 카카오 계정과 같습니다. 내 매장이 아니면 체크를 해제해 주세요.</p></header>
    <ul className="space-y-2">{candidates.map(candidate => <li key={candidate.customerId}>
      <label className="flex min-h-11 items-start gap-3 rounded-lg border bg-white p-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={checked.has(candidate.customerId)} disabled={busy}
          onChange={event => setChecked(previous => { const next = new Set(previous); if (event.target.checked) next.add(candidate.customerId); else next.delete(candidate.customerId); return next; })} />
        <span><span className="block font-semibold">{candidate.customerName}</span>{candidate.addressHint ? <span className="block text-sm text-slate-600">{candidate.addressHint}…</span> : null}</span>
      </label></li>)}</ul>
    {message ? <p role="status" className="text-sm text-rose-700">{message}</p> : null}
    <div className="flex flex-col gap-2 sm:flex-row">
      <button type="button" className="maju-button-primary min-h-11 px-4" disabled={busy || checked.size === 0} onClick={() => send("confirm")}>선택한 매장 연결하기</button>
      <button type="button" className="min-h-11 rounded-lg border px-4" disabled={busy} onClick={() => send("decline")}>내 매장이 아님</button>
    </div>
  </section>;
}
