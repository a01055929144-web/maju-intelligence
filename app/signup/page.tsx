"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRight, Building2, Check, Loader2, LogIn, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isValidBusinessRegistrationNumber } from "@/lib/business-number";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

function formatBusinessNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export default function CompanySignupPage() {
  const [companyName, setCompanyName] = useState("");
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerPasswordConfirm, setOwnerPasswordConfirm] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const businessNumberDigits = businessRegistrationNumber.replace(/[^0-9]/g, "");
  const businessNumberInvalid = businessNumberDigits.length === 10 && !isValidBusinessRegistrationNumber(businessRegistrationNumber);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!isValidBusinessRegistrationNumber(businessRegistrationNumber)) {
      setError("사업자등록번호가 올바르지 않습니다. 다시 확인해주세요.");
      return;
    }
    if (ownerPassword !== ownerPasswordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    if (!termsAgreed || !privacyAgreed) {
      setError("이용약관과 개인정보처리방침에 모두 동의해야 가입할 수 있습니다.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithTimeout("/api/company-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          businessRegistrationNumber,
          ownerName,
          ownerEmail,
          ownerPassword,
          termsAgreed,
          privacyAgreed
        })
      }, 12000);

      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.message || "가입 처리 중 오류가 발생했습니다.");
        return;
      }

      window.location.href = "/dashboard";
    } catch (error) {
      setError(error instanceof Error ? error.message : "가입 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f4] px-4 py-10">
      <Card className="w-full max-w-lg rounded-[24px] shadow-[0_18px_50px_rgba(15,23,42,.10)]">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-lime-100 text-slate-950 ring-1 ring-inset ring-lime-200">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            회사 계정 등록
          </Badge>
          <CardTitle className="text-2xl">새 회사 작업공간 만들기</CardTitle>
          <p className="text-sm font-medium leading-6 text-slate-500">회사를 처음 등록하는 대표·운영 책임자용입니다. 가입을 마치면 이 계정이 최초 관리자가 됩니다.</p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <Link className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50" href="/dashboard/login">
              <LogIn className="h-4 w-4 shrink-0 text-teal-700" />
              <span>기존 회사 운영자<br /><span className="text-xs font-medium text-slate-500">로그인하기</span></span>
            </Link>
            <Link className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50" href="/mobile/join">
              <Users className="h-4 w-4 shrink-0 text-teal-700" />
              <span>직원으로 초대받음<br /><span className="text-xs font-medium text-slate-500">초대 가입하기</span></span>
            </Link>
          </div>

          <div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            새 회사 정보 입력
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <form aria-busy={loading} className="space-y-2.5" onSubmit={handleSubmit}>
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="회사명"
              required
            />
            <div>
              <input
                className={`h-12 w-full rounded-xl border bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring ${businessNumberInvalid ? "border-destructive" : "border-input"}`}
                value={businessRegistrationNumber}
                onChange={(event) => setBusinessRegistrationNumber(formatBusinessNumberInput(event.target.value))}
                placeholder="사업자등록번호 (예: 123-45-67890)"
                inputMode="numeric"
                required
              />
              {businessNumberInvalid ? <p className="mt-1 px-1 text-xs font-bold text-destructive">사업자등록번호를 다시 확인해주세요.</p> : null}
            </div>
            <input
              autoComplete="name"
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              name="ownerName"
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="운영 책임자 이름"
              required
            />
            <input
              autoComplete="username"
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              name="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              type="email"
              placeholder="업무용 이메일"
              required
            />
            <input
              autoComplete="new-password"
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              name="password"
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
              type="password"
              placeholder="비밀번호 (8자 이상)"
              minLength={8}
              required
            />
            <input
              autoComplete="new-password"
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              name="passwordConfirm"
              value={ownerPasswordConfirm}
              onChange={(event) => setOwnerPasswordConfirm(event.target.value)}
              type="password"
              placeholder="비밀번호 확인"
              minLength={8}
              required
            />

            <div className="space-y-1.5 rounded-xl border border-input bg-slate-50 p-3">
              <label className="flex items-start gap-2 text-xs font-bold text-slate-700">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0"
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(event) => setTermsAgreed(event.target.checked)}
                />
                <span>
                  [필수]{" "}
                  <Link className="underline underline-offset-2" href="/legal/terms" target="_blank">
                    이용약관
                  </Link>
                  에 동의합니다.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs font-bold text-slate-700">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0"
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(event) => setPrivacyAgreed(event.target.checked)}
                />
                <span>
                  [필수]{" "}
                  <Link className="underline underline-offset-2" href="/legal/privacy" target="_blank">
                    개인정보처리방침
                  </Link>
                  에 동의합니다.
                </span>
              </label>
            </div>

            {error ? <p aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive" role="alert">{error}</p> : null}

            <Button className="mt-1.5 min-h-12 w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "회사 계정 등록 중…" : "회사 계정 등록"}
              {!loading ? <ArrowRight className="ml-auto h-4 w-4" /> : null}
            </Button>
            {loading ? <p aria-live="polite" className="text-center text-xs font-medium text-slate-500">완료되면 운영 화면으로 자동 이동합니다.</p> : null}
            {!loading ? <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-slate-500"><Check className="h-3.5 w-3.5 text-teal-700" />등록 후 운영 대시보드로 바로 이동합니다.</p> : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
