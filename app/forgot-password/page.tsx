"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setLoading(false);

    if (!response.ok) {
      setMessage(data?.message || "요청 처리 중 오류가 발생했습니다.");
      return;
    }

    setSubmitted(true);
    setMessage(data?.message || "가입된 이메일이면 비밀번호 재설정 링크를 보내드렸습니다.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center maju-app-bg px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <KeyRound className="mr-1 h-3.5 w-3.5" />
            MAJU Company
          </Badge>
          <CardTitle className="text-2xl">비밀번호 찾기</CardTitle>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm font-bold leading-6 text-emerald-800">{message}</p>
          ) : (
            <form className="space-y-2.5" onSubmit={handleSubmit}>
              <p className="mb-1 text-sm font-semibold leading-6 text-muted-foreground">가입하신 이메일을 입력하시면 비밀번호 재설정 링크를 보내드립니다.</p>
              <input
                className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="가입 이메일"
                required
              />
              {message ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{message}</p> : null}
              <Button className="mt-1.5 w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                재설정 링크 받기
              </Button>
            </form>
          )}
          <Link className="mt-4 block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/dashboard/login">
            로그인 화면으로 돌아가기
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
