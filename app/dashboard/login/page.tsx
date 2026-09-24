"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Building2, Check, Clock3, Loader2, LogIn, MapPinned, Route, Smartphone, Truck } from "lucide-react";
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
  const [remember, setRemember] = useState(false);

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
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f4] px-4 py-8 sm:px-6">
      <div className="grid min-w-0 w-[calc(100vw-2rem)] max-w-5xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,.12)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden min-h-[660px] overflow-hidden bg-[#101827] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-16 h-64 w-64 rounded-full border-[48px] border-[#b9ed5c]/10" />
          <div className="absolute bottom-24 right-10 h-40 w-40 rounded-full bg-[#b9ed5c]/5 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#b9ed5c] text-base font-black text-[#101827]">M</span>
              <div>
                <p className="text-base font-bold">MAJU Intelligence</p>
                <p className="text-xs font-medium text-slate-400">Sales & delivery operations</p>
              </div>
            </div>
            <h1 className="mt-16 text-[36px] font-bold leading-[1.18] tracking-[-0.045em]">
              <span className="block whitespace-nowrap">오늘의 배송을</span>
              <span className="block whitespace-nowrap">한 화면에서</span>
              <span className="block whitespace-nowrap">끝내세요.</span>
            </h1>
            <p className="mt-5 max-w-sm text-sm font-medium leading-6 text-slate-300">
              배차, 최적 경로, 실시간 차량, 배송 증빙을 하나의 운영 흐름으로 연결합니다.
            </p>
          </div>

          <div className="relative space-y-3">
            {[
              { icon: MapPinned, label: "거래처와 차량을 한 지도에서 확인" },
              { icon: Route, label: "배송 순서를 자동으로 최적화" },
              { icon: Truck, label: "완료 사진과 운행기록을 자동 보관" }
            ].map((item) => (
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3" key={item.label}>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#b9ed5c]/15 text-[#b9ed5c]">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-slate-200">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="min-w-0 space-y-4 p-4 sm:p-8 lg:p-10">
        <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200 shadow-none">
          <CardHeader>
            <Badge className="mb-3 w-fit bg-lime-100 text-slate-900 ring-1 ring-inset ring-lime-200">
              <Building2 className="mr-1 h-3.5 w-3.5" />
              회사 운영자
            </Badge>
            <CardTitle className="text-2xl font-bold tracking-[-0.03em]">운영 화면 로그인</CardTitle>
            <p className="mt-1 text-sm font-medium leading-5 text-muted-foreground">대표·관리자는 이메일로 로그인하세요.</p>
          </CardHeader>
          <CardContent>
            {recentLoginEmail ? (
              <div className="mb-3">
                <button
                  aria-label={`최근 사용 이메일 ${recentLoginEmail} 입력`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-lime-100 hover:text-slate-950"
                  onClick={() => setEmail(recentLoginEmail)}
                  type="button"
                >
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span className="shrink-0">최근 사용 이메일</span>
                  <span className="truncate">{recentLoginEmail}</span>
                </button>
              </div>
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
              {error ? <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive" role="alert">{error}</p> : null}
              <label className="flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-primary/30 hover:bg-lime-50/60">
                <span className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      remember ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-transparent"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  로그인 상태 유지
                </span>
                <input checked={remember} className="sr-only" onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
                <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:inline">개인 PC에서만</span>
              </label>
              <Button aria-busy={loading} className="mt-1.5 h-12 w-full rounded-xl bg-[#101827] font-bold text-white hover:bg-[#1b2639]" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {loading ? "계정과 작업공간 확인 중…" : "로그인"}
                {!loading ? <ArrowRight className="ml-auto h-4 w-4" /> : null}
              </Button>
              {loading ? <p aria-live="polite" className="text-center text-xs font-medium text-slate-500">로그인이 완료되면 운영 화면으로 자동 이동합니다.</p> : null}
              <Link className="block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/forgot-password">
                비밀번호를 잊으셨나요?
              </Link>
              <Link className="block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/admin/login">
                플랫폼 관리자 로그인
              </Link>
              <Link className="block text-center text-sm font-bold text-primary underline-offset-4 hover:underline" href="/signup">
                처음이신가요? 회사 가입하기
              </Link>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden rounded-2xl border-slate-200 bg-slate-50/70 shadow-none">
          <CardHeader>
            <Badge className="mb-3 w-fit bg-[#FEE500]/30 text-[#7a5c00]">
              <Smartphone className="mr-1 h-3.5 w-3.5" />
              직원용
            </Badge>
            <CardTitle className="text-xl font-bold tracking-[-0.025em]">직원 카카오 로그인</CardTitle>
            <p className="mt-1 text-sm font-medium leading-5 text-muted-foreground">초대받은 직원은 카카오로 바로 시작하세요.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <OAuthLoginButtons />
            <Link
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-lime-400 hover:bg-lime-50"
              href="/mobile/join"
            >
              <Smartphone className="h-4 w-4" />
              모바일 화면으로 카카오 로그인
            </Link>
            <p className="break-keep text-center text-xs font-medium leading-5 text-slate-500">
              처음 한 번은 관리자가 보낸 초대 링크가 필요합니다.
            </p>
          </CardContent>
        </Card>
        </div>
      </div>
    </main>
  );
}
