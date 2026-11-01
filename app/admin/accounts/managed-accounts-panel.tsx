"use client";

import { useState } from "react";
import { KeyRound, LockOpen, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ManagedLoginAccount } from "@/lib/store";

export function ManagedAccountsPanel({ initialAccounts }: { initialAccounts: ManagedLoginAccount[] }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [form, setForm] = useState({ companyId: "", loginId: "", name: "", role: "customer_member" });
  const [message, setMessage] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  async function createAccount() {
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, workspaceRole: form.role === "customer_owner" ? "owner" : "member" })
    });
    await applyResponse(response, true);
  }

  async function runAction(account: ManagedLoginAccount, action: "change_login_id" | "disable" | "reset_password" | "unlock") {
    const loginId = action === "change_login_id" ? window.prompt("새 아이디", account.loginId)?.trim() : undefined;
    if (action === "change_login_id" && !loginId) return;
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, loginId: loginId || account.loginId, targetRole: account.role, userId: account.id })
    });
    await applyResponse(response, action === "reset_password");
  }

  async function applyResponse(response: Response, showPassword: boolean) {
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.message || "계정 작업에 실패했습니다.");
      return;
    }
    setAccounts(payload.accounts || accounts);
    setTemporaryPassword(showPassword ? payload.temporaryPassword || "" : "");
    setMessage(showPassword ? "임시 비밀번호는 지금 한 번만 복사할 수 있습니다." : "계정 상태를 반영했습니다.");
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>계정 만들기</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <input aria-label="아이디" className="maju-input" onChange={(event) => setForm({ ...form, loginId: event.target.value })} placeholder="아이디" value={form.loginId} />
          <input aria-label="이름" className="maju-input" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="이름" value={form.name} />
          <select aria-label="역할" className="maju-input" onChange={(event) => setForm({ ...form, role: event.target.value })} value={form.role}>
            <option value="customer_owner">고객사 대표</option>
            <option value="customer_member">고객사 직원</option>
            <option value="maju_operator">MAJU 운영자</option>
            <option value="maju_super_admin">MAJU 최고 관리자</option>
          </select>
          <input aria-label="회사 ID" className="maju-input" onChange={(event) => setForm({ ...form, companyId: event.target.value })} placeholder="고객사일 때 회사 ID" value={form.companyId} />
          <Button onClick={createAccount} type="button"><Plus className="h-4 w-4" />계정 만들기</Button>
        </CardContent>
      </Card>

      {message ? <div aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">{message}{temporaryPassword ? <code className="mt-2 block select-all rounded bg-slate-950 p-3 text-white">{temporaryPassword}</code> : null}</div> : null}

      <Card>
        <CardHeader><CardTitle>등록 계정</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {accounts.map((account) => (
            <div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[1fr_1fr_auto] md:items-center" key={account.id}>
              <div><p className="font-black">{account.name}</p><p className="text-sm text-muted-foreground">{account.loginId} · {roleLabel(account.role)}</p></div>
              <div className="text-sm"><p>{account.companyName || "MAJU 플랫폼"}</p><p className={account.status === "active" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{account.status === "active" ? "사용 중" : "사용 중지"}{account.mustChangePassword ? " · 비밀번호 변경 필요" : ""}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runAction(account, "change_login_id")} size="sm" type="button" variant="outline">아이디 변경</Button>
                <Button onClick={() => runAction(account, "reset_password")} size="sm" type="button" variant="outline"><KeyRound className="h-4 w-4" />재설정</Button>
                <Button onClick={() => runAction(account, "unlock")} size="sm" type="button" variant="outline"><LockOpen className="h-4 w-4" />잠금 풀기</Button>
                <Button className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => runAction(account, "disable")} size="sm" type="button" variant="outline"><Power className="h-4 w-4" />끄기</Button>
              </div>
            </div>
          ))}
          {!accounts.length ? <p className="py-8 text-center text-sm text-muted-foreground">등록된 아이디 계정이 없습니다.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function roleLabel(role: ManagedLoginAccount["role"]) {
  return ({ customer_owner: "고객사 대표", customer_member: "고객사 직원", maju_operator: "MAJU 운영자", maju_super_admin: "MAJU 최고 관리자" })[role];
}
