"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Building2, Lock, LogIn, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("dyoung456@naver.com");
  const [password, setPassword] = useState("0000");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(nextEmail = email, nextPassword = password) {
    setLoading(true);
    setError("");

    const response = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: nextEmail, password: nextPassword })
    });

    setLoading(false);

    if (!response.ok) {
      setError("고객사 계정 정보를 확인해주세요.");
      return;
    }

    window.location.href = "/dashboard";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login();
  }

  return (
    <main className="flex min-h-screen items-center justify-center maju-app-bg px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            MAJU Company
          </Badge>
          <CardTitle className="text-2xl">로그인</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            className="mb-4 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-black text-[#191919] shadow-[0_10px_24px_rgba(250,204,21,0.20)] transition hover:brightness-95"
            href="/api/auth/kakao/start"
          >
            <MessageCircle className="h-4 w-4" />
            카카오로 가입한 직원은 카카오로 로그인
          </Link>
          <div className="mb-4 flex items-center gap-3 text-xs font-bold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는 이메일로 로그인
            <span className="h-px flex-1 bg-border" />
          </div>
          <form className="space-y-2.5" onSubmit={handleSubmit}>
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="이메일"
            />
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="비밀번호"
            />
            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{error}</p> : null}
            <Button className="mt-1.5 w-full" disabled={loading}>
              {loading ? <Lock className="h-4 w-4 animate-pulse" /> : <LogIn className="h-4 w-4" />}
              로그인
            </Button>
            <Link className="block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/admin/login">
              관리자 계정으로 로그인
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
