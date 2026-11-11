"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

/** 유통사에서 받은 초대코드를 입력해 그 유통사와 연결한다. 유통사 목록·검색은 없다. */
export function StoreInviteCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true); setMessage(""); setDone(false);
    try {
      const response = await fetch("/api/store/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.ok) { setDone(true); setCode(""); router.refresh(); return; }
      setMessage(body.message || "연결하지 못했습니다.");
    } catch { setMessage("연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  return <form aria-label="유통사 초대코드 입력" className="space-y-2" onSubmit={submit}>
    <label className="block text-sm font-semibold" htmlFor="store-invite-code">초대코드
      <span className="block text-xs font-normal text-slate-500">거래할 유통사에서 받은 8자리 코드를 입력하세요.</span>
    </label>
    <div className="flex gap-2">
      <input autoCapitalize="characters" autoComplete="off" className="min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm uppercase tracking-widest" id="store-invite-code" maxLength={9} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" spellCheck={false} value={code} />
      <Button className="min-h-[44px] shrink-0" disabled={busy || !code.trim()} type="submit">{busy ? "확인 중…" : "연결하기"}</Button>
    </div>
    {message ? <p className="text-sm text-rose-700" role="alert">{message}</p> : null}
    {done ? <p className="text-sm text-teal-700" role="status">연결했어요. 연결된 유통사는 아래 목록에 나타납니다.</p> : null}
  </form>;
}
