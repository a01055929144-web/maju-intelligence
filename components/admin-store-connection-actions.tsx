"use client";

import { useCallback, useEffect, useState } from "react";

// CX-144 U0: MAJU 관리자 매장 상세의 연결 관리(탈퇴 처리·구성원 연결 해제·점주 추가). 기능을 켠 회사에서만 보인다.
type Member = { id: string; role: string; status: string; name: string; phone: string | null };
type Connection = { status: string; members: Member[] };
const ROLE: Record<string, string> = { owner: "점주", manager: "관리자", staff: "직원" };

export function AdminStoreConnectionActions({ companyId, storeAccountId }: { companyId: string; storeAccountId: string }) {
  const [state, setState] = useState<"loading" | "off" | "error" | "ready">("loading");
  const [data, setData] = useState<Connection | null>(null);
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/store-connections?companyId=${encodeURIComponent(companyId)}&storeAccountId=${encodeURIComponent(storeAccountId)}`, { cache: "no-store" });
      if (response.status === 404) return setState("off");
      if (!response.ok) return setState("error");
      setData(await response.json() as Connection); setState("ready");
    } catch { setState("error"); }
  }, [companyId, storeAccountId]);
  useEffect(() => { void load(); }, [load]);
  async function act(body: Record<string, unknown>, confirmText: string, done: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true); setMessage(""); setInvite("");
    try {
      const response = await fetch("/api/admin/store-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, storeAccountId, ...body }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "처리하지 못했습니다.");
      if (typeof payload.activationUrl === "string") { setInvite(payload.activationUrl); await navigator.clipboard?.writeText(payload.activationUrl).catch(() => null); }
      setMessage(done); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  }
  if (state === "off" || state === "loading") return null;
  if (state === "error" || !data) return <p role="alert" className="text-xs font-bold text-rose-700">매장 연결을 불러오지 못했습니다.</p>;
  const closed = data.status === "closed";
  return <section aria-label="매장 연결 관리" className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
    <p className="text-xs font-black text-violet-900">매장 연결 관리 · {closed ? "탈퇴 처리됨" : "운영 중"}</p>
    {data.members.length ? <ul className="space-y-1">{data.members.map(member => <li className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700" key={member.id}>
      <span>{member.name} · {ROLE[member.role] ?? member.role}{member.status === "invited" ? " (초대 중)" : ""}</span>
      <button className="min-h-11 text-xs font-bold text-rose-700 underline disabled:opacity-50" disabled={busy}
        onClick={() => void act({ action: "remove_member", memberId: member.id }, `${member.name}님의 매장 연결을 해제합니다. 계속할까요?`, "연결을 해제했습니다.")} type="button">연결 해제</button>
    </li>)}</ul> : <p className="text-xs font-semibold text-slate-500">연결된 구성원이 없습니다.</p>}
    <div className="flex flex-wrap gap-2">
      <button className="min-h-11 rounded-lg border border-violet-700 px-3 text-xs font-black text-violet-900 disabled:opacity-50" disabled={busy}
        onClick={() => void act({ action: "add_owner" }, "점주 추가 초대 링크를 만듭니다(30분 유효, 링크가 복사됩니다). 계속할까요?", "초대 링크를 만들어 복사했습니다.")} type="button">점주 추가</button>
      {!closed ? <button className="min-h-11 rounded-lg bg-rose-700 px-3 text-xs font-black text-white disabled:opacity-50" disabled={busy}
        onClick={() => void act({ action: "close" }, "매장을 탈퇴 처리하면 모든 구성원이 해제되고 주문 링크가 회수됩니다(주문 기록은 남습니다). 계속할까요?", "매장 탈퇴 처리했습니다.")} type="button">매장 탈퇴 처리</button> : null}
    </div>
    {invite ? <input aria-label="점주 초대 링크" className="h-11 w-full rounded-md border border-violet-200 bg-white px-3 text-xs font-semibold" onFocus={event => event.currentTarget.select()} readOnly value={invite} /> : null}
    {message ? <p role="status" className="text-xs font-bold text-slate-800">{message}</p> : null}
  </section>;
}
