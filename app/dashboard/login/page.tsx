"use client";

import { FormEvent, useState } from "react";
import { Building2, Lock, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("owner@maju.local");
  const [password, setPassword] = useState("maju-owner-2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    setLoading(false);

    if (!response.ok) {
      setError("고객사 계정 정보를 확인해주세요.");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            MAJU Company
          </Badge>
          <CardTitle className="text-2xl">고객사 로그인</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">대표와 팀원이 자기 회사의 AI 진단 리포트만 확인하는 화면입니다.</p>
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

