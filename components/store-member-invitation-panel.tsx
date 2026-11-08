"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function StoreMemberInvitationPanel() {
  const token = useRef("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    token.current = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (/^[A-Za-z0-9_-]{43}$/.test(token.current)) setReady(true);
    else setError("초대 링크를 확인할 수 없습니다. 점주에게 새 링크를 요청해 주세요.");
  }, []);
  async function accept() {
    if (busy || !token.current) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/members/accept", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current }) });
      if (!response.ok) throw new Error("초대가 만료되었거나 이미 사용되었습니다. 점주에게 새 링크를 요청해 주세요.");
      const result = await response.json() as { loginUrl?: string };
      if (!result.loginUrl?.startsWith("/api/auth/kakao/start?")) throw new Error("로그인 주소를 확인하지 못했습니다.");
      token.current = "";
      window.location.assign(result.loginUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "초대를 확인하지 못했습니다.");
      setBusy(false);
    }
  }
  return <Card><CardHeader><CardTitle>매장 구성원 초대</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm">초대한 매장의 관리자 또는 직원 계정을 카카오로 연결합니다.</p>
    {error && <p role="alert">{error}</p>}
    <Button className="min-h-[44px]" disabled={busy || !ready} onClick={() => void accept()}>{busy ? "초대 확인 중" : "카카오로 초대 수락"}</Button>
  </CardContent></Card>;
}
