"use client";

import { useState } from "react";
import { OAuthLoginButtons } from "@/components/oauth-login-buttons";

/** 초대받은 휴대폰 번호 끝 4자리를 확인한 뒤 카카오로 계속합니다. */
export function InvitePhoneGate({ inviteCode }: { inviteCode: string }) {
  const [digits, setDigits] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function verify() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/auth/invite-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, lastFour: digits })
    }).catch(() => null);
    const payload = response ? ((await response.json().catch(() => null)) as { message?: string } | null) : null;
    setBusy(false);
    if (!response?.ok) {
      setMessage(payload?.message || "확인하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setVerified(true);
  }

  if (verified) return <OAuthLoginButtons inviteCode={inviteCode} />;
  return (
    <div className="space-y-2">
      <label className="block text-sm font-bold text-slate-800" htmlFor="invite-last-four">휴대폰 번호 뒷자리 4자리를 입력해 주세요</label>
      <p className="text-xs font-medium text-slate-500">회사에 등록된 내 휴대폰 번호로 본인인지 확인합니다.</p>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-lg font-bold tracking-[0.15em] text-slate-500">010-****-</span>
        <input
          autoComplete="off"
          className="h-12 w-28 min-w-0 rounded-xl border border-slate-300 px-3 text-center text-lg font-bold tracking-[0.3em]"
          placeholder="____"
          id="invite-last-four"
          inputMode="numeric"
          maxLength={4}
          onChange={(event) => setDigits(event.target.value.replace(/\D/g, "").slice(0, 4))}
          value={digits}
        />
        <button className="ml-auto h-12 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy || digits.length !== 4} onClick={() => void verify()} type="button">
          {busy ? "확인 중" : "확인"}
        </button>
      </div>
      {message ? <p className="text-sm font-bold text-rose-700" role="alert">{message}</p> : null}
    </div>
  );
}
