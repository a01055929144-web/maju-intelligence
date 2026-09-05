"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Building2, Check, Clock3, Lock, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthLoginButtons } from "@/components/oauth-login-buttons";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const RECENT_LOGIN_STORAGE_KEY = "maju_recent_customer_login";

function readRecentLoginEmail() {
  if (typeof window === "undefined") return "";
  const storedEmail = window.localStorage.getItem(RECENT_LOGIN_STORAGE_KEY) || "";
  if (storedEmail.toLowerCase() === "owner@maju.local") {
    window.localStorage.removeItem(RECENT_LOGIN_STORAGE_KEY);
    return "";
  }
  return storedEmail;
}

async function resolvePostLoginPath() {
  const response = await fetchWithTimeout("/api/customer/workspaces").catch(() => null);
  if (!response?.ok) return "/dashboard";
  const data = (await response.json().catch(() => null)) as { workspaces?: unknown[] } | null;
  return data?.workspaces && data.workspaces.length > 1 ? "/workspaces" : "/dashboard";
}

export default function CustomerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentLoginEmail, setRecentLoginEmail] = useState(readRecentLoginEmail);
  const [remember, setRemember] = useState(true);
  const [autoLoginChecking, setAutoLoginChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchWithTimeout("/api/customer/me")
      .then(async (response) => {
        if (!mounted) return;
        if (!response.ok) {
          setAutoLoginChecking(false);
          return;
        }
        window.location.href = await resolvePostLoginPath();
      })
      .catch(() => {
        if (mounted) setAutoLoginChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function login(nextEmail = email, nextPassword = password) {
    setLoading(true);
    setError("");

    // 2026-08-31 에러 처리 감사 대응: fetch에 catch가 없어 네트워크가 끊긴 채로 로그인을
    // 시도하면 setLoading(false)가 실행되지 않고 버튼이 영구히 잠긴 채 아무 안내도 없이
    // 멈춰 있었습니다(unhandled rejection). try/finally로 감싸 항상 로딩 상태를 풀고,
    // 네트워크 자체가 실패한 경우에는 별도 안내 문구를 보여줍니다. fetchWithTimeout을 써서
    // 서버가 응답 없이 연결만 붙들고 있는 경우(방화벽 드롭 등)에도 무한 대기하지 않습니다.
    try {
      const response = await fetchWithTimeout("/api/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail, password: nextPassword, remember })
      });

      if (!response.ok) {
        if (nextEmail && nextEmail === recentLoginEmail) {
          try {
            window.localStorage.removeItem(RECENT_LOGIN_STORAGE_KEY);
          } catch {
            // localStorage 정리에 실패해도 오류 안내는 계속 보여줍니다.
          }
          setRecentLoginEmail("");
        }
        setError("고객사 계정 정보를 확인해주세요.");
        return;
      }

      try {
        window.localStorage.setItem(RECENT_LOGIN_STORAGE_KEY, nextEmail);
      } catch {
        // 시크릿 모드 등에서 localStorage 접근이 막혀도 로그인 자체는 계속 진행합니다.
      }
      setRecentLoginEmail(nextEmail);
      window.location.href = await resolvePostLoginPath();
    } catch (error) {
      setError(error instanceof Error && error.name === "FetchTimeoutError" ? error.message : "네트워크 연결을 확인한 뒤 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
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
          <div className="mb-4">
            <OAuthLoginButtons />
          </div>
          <div className="mb-4 flex items-center gap-3 text-xs font-bold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는 이메일로 로그인
            <span className="h-px flex-1 bg-border" />
          </div>
          {autoLoginChecking ? (
            <p className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-xs font-black text-teal-800 ring-1 ring-inset ring-teal-100">자동 로그인 확인 중입니다.</p>
          ) : recentLoginEmail ? (
            <button
              className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-teal-50 hover:text-teal-800"
              onClick={() => setEmail(recentLoginEmail)}
              type="button"
            >
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0">최근 로그인 이메일</span>
              <span className="truncate">{recentLoginEmail}</span>
            </button>
          ) : null}
          <form className="space-y-2.5" onSubmit={handleSubmit}>
            <input
              autoComplete="username"
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              id="customer-login-email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="이메일"
            />
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              id="customer-login-password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="비밀번호"
            />
            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{error}</p> : null}
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-primary/30 hover:bg-teal-50/60">
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    remember ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                로그인 유지
              </span>
              <input checked={remember} className="sr-only" onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
              <span className="text-xs font-extrabold text-muted-foreground">계속 유지</span>
            </label>
            <Button className="mt-1.5 w-full" disabled={loading}>
              {loading ? <Lock className="h-4 w-4 animate-pulse" /> : <LogIn className="h-4 w-4" />}
              로그인
            </Button>
            <Link className="block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/forgot-password">
              비밀번호를 잊으셨나요?
            </Link>
            <Link className="block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/admin/login">
              관리자 계정으로 로그인
            </Link>
            <Link className="block text-center text-sm font-bold text-primary underline-offset-4 hover:underline" href="/signup">
              처음이신가요? 회사 가입하기
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
