"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Building2, Loader2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (ownerPassword !== ownerPasswordConfirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }
    if (!termsAgreed || !privacyAgreed) {
      setError("이용약관과 개인정보처리방침에 모두 동의해야 가입할 수 있습니다.");
      return;
    }

    setLoading(true);
    const response = await fetch("/api/company-signup", {
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
    });

    const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setLoading(false);

    if (!response.ok || !data?.ok) {
      setError(data?.message || "가입 처리 중 오류가 발생했습니다.");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="flex min-h-screen items-center justify-center maju-app-bg px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            MAJU Company
          </Badge>
          <CardTitle className="text-2xl">회사 가입</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-2.5" onSubmit={handleSubmit}>
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="회사명"
              required
            />
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={businessRegistrationNumber}
              onChange={(event) => setBusinessRegistrationNumber(formatBusinessNumberInput(event.target.value))}
              placeholder="사업자등록번호 (예: 123-45-67890)"
              inputMode="numeric"
              required
            />
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="담당자명"
              required
            />
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              type="email"
              placeholder="담당자 이메일"
              required
            />
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
              type="password"
              placeholder="비밀번호 (8자 이상)"
              minLength={8}
              required
            />
            <input
              className="h-12 w-full rounded-xl border border-input bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-ring"
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

            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive">{error}</p> : null}

            <Button className="mt-1.5 w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              가입하기
            </Button>

            <Link className="block text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline" href="/dashboard/login">
              이미 계정이 있으신가요? 로그인
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
