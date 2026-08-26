"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword !== newPasswordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword })
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setError(data?.message || "비밀번호 재설정에 실패했습니다.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="text-sm font-bold leading-6 text-slate-700">비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.</p>
        <Link className="inline-block text-sm font-bold text-primary underline-offset-4 hover:underline" href="/dashboard/login">
          로그인하러 가기
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-2.5" onSubmit={handleSubmit}>
      <input
        className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        type="password"
        placeholder="새 비밀번호 (8자 이상)"
        minLength={8}
        required
      />
      <input
        className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={newPasswordConfirm}
        onChange={(event) => setNewPasswordConfirm(event.target.value)}
        type="password"
        placeholder="새 비밀번호 확인"
        minLength={8}
        required
      />
      {error ? (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">
          <p>{error}</p>
          <Link className="mt-1 inline-block underline underline-offset-2" href="/forgot-password">
            재설정 링크 다시 요청하기
          </Link>
        </div>
      ) : null}
      <Button className="mt-1.5 w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        비밀번호 재설정
      </Button>
    </form>
  );
}
