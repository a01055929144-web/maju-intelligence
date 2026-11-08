"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Role = "owner" | "manager" | "staff";
type Member = { id: string; joinedAt: string | null; name: string; role: Role; status: "active" | "invited" };
type Result = { actorMemberId: string; actorRole: "owner" | "manager"; members: Member[]; message?: string };
const roleLabel = { owner: "점주", manager: "관리자", staff: "직원" };

export function StoreMemberManagementPanel({ companyId, storeAccountId }: { companyId: string; storeAccountId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const query = new URLSearchParams({ companyId, storeAccountId }).toString();
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/store/members?${query}`, { cache: "no-store" });
      const body = await response.json() as Result;
      if (!response.ok) throw new Error(body.message || "구성원 목록을 불러오지 못했습니다.");
      setResult(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "구성원 목록을 불러오지 못했습니다."); }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  async function invite(role: "manager" | "staff") {
    setBusy(true); setError(""); setInviteUrl("");
    try {
      const response = await fetch("/api/store/members", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, role, storeAccountId }) });
      const body = await response.json() as { inviteUrl?: string; message?: string };
      if (!response.ok || !body.inviteUrl) throw new Error(body.message || "초대 링크를 만들지 못했습니다.");
      setInviteUrl(body.inviteUrl); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "초대 링크를 만들지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function remove(member: Member) {
    if (!window.confirm(`${member.name} 구성원을 내보낼까요?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/members", { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, storeAccountId, targetMemberId: member.id }) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message || "구성원을 내보내지 못했습니다.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "구성원을 내보내지 못했습니다."); }
    finally { setBusy(false); }
  }

  const canRemove = (member: Member) => member.status === "active" && member.role !== "owner" &&
    member.id !== result?.actorMemberId && (result?.actorRole === "owner" || member.role === "staff");
  return <Card><CardHeader><CardTitle>매장 구성원 관리</CardTitle>
    <p className="text-sm text-slate-600">점주는 관리자와 직원을, 관리자는 직원만 초대하거나 내보낼 수 있습니다.</p>
  </CardHeader><CardContent className="space-y-4">
    <div className="flex flex-col gap-2 sm:flex-row">
      {result?.actorRole === "owner" && <Button disabled={busy} onClick={() => void invite("manager")}>관리자 초대</Button>}
      <Button disabled={busy || !result} onClick={() => void invite("staff")}>직원 초대</Button>
      <Button variant="outline" disabled={busy} onClick={() => void load()}>다시 불러오기</Button>
    </div>
    {inviteUrl && <div role="status" className="break-all rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
      <p>초대 링크가 준비됐습니다. 초대할 구성원에게 안전하게 전달해 주세요.</p>
      <Button className="mt-2" variant="outline" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>링크 복사</Button>
    </div>}
    {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {!result && !error && <p role="status" className="text-sm text-slate-600">구성원 목록을 불러오는 중입니다.</p>}
    {result?.members.length === 0 && <p className="text-sm text-slate-600">등록된 구성원이 없습니다. 직원 초대로 시작해 주세요.</p>}
    <ul className="space-y-2">{result?.members.map(member => <li key={member.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="truncate font-medium">{member.name}</p><div className="mt-1 flex flex-wrap gap-2">
        <Badge>{roleLabel[member.role]}</Badge><Badge>{member.status === "active" ? "사용 중" : "초대 대기"}</Badge>
      </div></div>
      {canRemove(member) && <Button variant="outline" disabled={busy} onClick={() => void remove(member)}>내보내기</Button>}
    </li>)}</ul>
  </CardContent></Card>;
}
