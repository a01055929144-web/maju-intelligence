"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import type { StoreConnectionAction } from "../domains/organization/store-connection";

export function StoreConnectionPanel({ companyId, storeAccountId }: { companyId: string; storeAccountId: string }) {
  const [access, setAccess] = useState<{ canLeave: boolean; canClose: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StoreConnectionAction | null>(null);
  const [disabled, setDisabled] = useState(false);
  const load = useCallback(async () => {
    setError(""); setAccess(null);
    try {
      const response = await fetch(`/api/store/connection?${new URLSearchParams({ companyId, storeAccountId })}`, { cache: "no-store" });
      if (response.status === 404) { setDisabled(true); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "매장 로그인을 확인한 뒤 다시 열어 주세요.");
      setAccess(body);
    } catch { setError("연결 정보를 불러오지 못했습니다. 매장 로그인을 확인한 뒤 다시 시도해 주세요."); }
  }, [companyId, storeAccountId]);
  useEffect(() => { void load(); }, [load]);
  async function change(action: StoreConnectionAction) {
    const message = action === "close"
      ? "매장을 삭제(이용 종료)할까요? 모든 구성원과 기존 주문 링크의 접근이 해제됩니다. 사업자정보·거래처·주문·정산 기록은 보존되며, 개인정보 영구 삭제는 담당자에게 요청해야 합니다."
      : "이 매장과 내 계정의 연결을 해제할까요? 다른 매장과 카카오 계정은 유지됩니다.";
    if (!window.confirm(message)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/connection", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, storeAccountId, action }) });
      const body = await response.json();
      if (!response.ok || body.completed !== true) throw new Error(body.message || "변경을 확인하지 못했습니다. 현재 연결 상태를 다시 확인해 주세요.");
      setDone(action); setAccess(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "현재 연결 상태를 다시 확인해 주세요."); }
    finally { setBusy(false); }
  }
  if (disabled) return <Card><CardHeader><CardTitle>매장 연결 관리</CardTitle></CardHeader><CardContent>
    <p>연결 관리 기능을 아직 사용할 수 없습니다. 담당자에게 연결 해제 또는 이용 종료를 요청해 주세요.</p>
    <Link className="inline-flex min-h-[44px] items-center underline" href="/store">매장 첫 화면으로</Link>
  </CardContent></Card>;
  return <Card><CardHeader><CardTitle>매장 연결 관리</CardTitle></CardHeader><CardContent className="space-y-4">
    {done ? <div role="status"><p>{done === "close" ? "매장 이용이 종료됐습니다. 모든 구성원과 기존 주문 링크의 접근이 해제됐습니다." : "이 매장과 내 계정의 연결이 해제됐습니다."}</p>
      <Link className="inline-flex min-h-[44px] items-center underline" href="/store">매장 첫 화면으로</Link></div> : <>
      <p className="text-sm">연결 해제는 내 매장 접근만 종료합니다. 점주는 매장 삭제(이용 종료)로 전체 접근을 종료할 수 있습니다.</p>
      <p className="text-sm">매장 삭제 후에도 사업자정보·거래처·주문·정산 기록은 보존됩니다. 개인정보 영구 삭제는 담당자에게 요청해 주세요. 다른 매장 연결과 카카오 계정은 유지됩니다.</p>
      {!access && !error && <p role="status">연결 정보를 확인하는 중입니다.</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        {access?.canLeave && <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void change("leave")}>내 연결 해제</Button>}
        {access?.canClose && <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void change("close")}>매장 삭제(이용 종료)</Button>}
        {error && <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void load()}>연결 상태 다시 확인</Button>}
      </div>
    </>}
    {busy && <p role="status">연결을 변경하는 중입니다.</p>}
    {error && <p role="alert">{error}</p>}
  </CardContent></Card>;
}
