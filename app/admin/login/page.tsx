"use client";

import { FormEvent, useState } from "react";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("a01055929144@gmail.com");
  const [password, setPassword] = useState("0000");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    setLoading(false);

    if (!response.ok) {
      setError("관리자 계정 정보를 확인해주세요.");
      return;
    }

    window.location.href = "/admin";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            MAJU Admin
          </Badge>
          <CardTitle className="text-2xl">관리자 로그인</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">고객사 데이터와 분석 작업을 관리하는 운영자 전용 화면입니다.</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">이메일</span>
              <input
                className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">비밀번호</span>
              <input
                className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
              />
            </label>
            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{error}</p> : null}
            <Button className="w-full" disabled={loading}>
              {loading ? <Lock className="h-4 w-4 animate-pulse" /> : <LogIn className="h-4 w-4" />}
              로그인
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
