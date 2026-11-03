"use client";

import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) {
      setMessage(payload?.message || "비밀번호를 변경하지 못했습니다.");
      setSaving(false);
      return;
    }
    window.location.href = payload?.redirectTo || "/dashboard/login";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <KeyRound className="h-8 w-8 text-primary" />
          <CardTitle>새 비밀번호 설정</CardTitle>
          <p className="text-sm text-muted-foreground">임시 비밀번호 대신 사용할 4자 이상의 비밀번호를 입력하세요.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <input autoComplete="new-password" className="maju-input w-full" minLength={4} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
            {message ? <p className="text-sm font-bold text-destructive" role="alert">{message}</p> : null}
            <Button className="w-full" disabled={saving}>{saving ? "변경 중" : "비밀번호 변경"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
