"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthCredentials } from "@/lib/store";

export function AdminAccountsForm({ initialCredentials }: { initialCredentials: AuthCredentials }) {
  const [form, setForm] = useState(initialCredentials);
  const [showPasswords, setShowPasswords] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });

    const payload = await response.json().catch(() => null);
    setSaving(false);

    if (!response.ok) {
      setMessage(payload?.message || "계정 저장에 실패했습니다.");
      return;
    }

    setForm(payload.credentials);
    setMessage(payload.persisted ? "계정 정보가 저장되었습니다." : "계정 정보가 화면에 반영되었습니다. 서버 저장 상태는 시스템 점검에서 확인하세요.");
  }

  function update<K extends keyof AuthCredentials>(key: K, value: AuthCredentials[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <AccountPanel
          email={form.adminEmail}
          label="관리자 계정"
          password={form.adminPassword}
          passwordVisible={showPasswords}
          onEmailChange={(value) => update("adminEmail", value)}
          onPasswordChange={(value) => update("adminPassword", value)}
        />
        <AccountPanel
          email={form.customerEmail}
          helper="기본 고객사 계정입니다. 실제 회사별 계정은 고객사 관리에서 다룹니다."
          label="기본 고객사 계정"
          password={form.customerPassword}
          passwordVisible={showPasswords}
          onEmailChange={(value) => update("customerEmail", value)}
          onPasswordChange={(value) => update("customerPassword", value)}
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-muted-foreground">기본 고객사 회사 ID</span>
        <input
          className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={form.customerCompanyId}
          onChange={(event) => update("customerCompanyId", event.target.value)}
        />
        <span className="block text-xs font-semibold leading-5 text-muted-foreground">
          이 값은 기본 고객사 계정이 로그인했을 때 연결될 회사 ID입니다. 실 고객사별 ID는 고객사 관리 화면의 회사 ID를 기준으로 사용합니다.
        </span>
      </label>

      {message ? (
        <p className={message.includes("실패") ? "rounded-md bg-destructive/10 px-3 py-2 text-sm font-bold text-destructive" : "rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary"}>
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "저장 중" : "변경 저장"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowPasswords((value) => !value)}>
          {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showPasswords ? "비밀번호 숨기기" : "비밀번호 보기"}
        </Button>
        <Link className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-4 text-sm font-bold transition hover:bg-muted" href="/admin/companies">
          고객사 관리로 이동
        </Link>
      </div>
    </form>
  );
}

function AccountPanel({
  email,
  helper,
  label,
  onEmailChange,
  onPasswordChange,
  password,
  passwordVisible
}: {
  email: string;
  helper?: string;
  label: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  password: string;
  passwordVisible: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-4">
      <p className="mb-4 font-black">{label}</p>
      {helper ? <p className="-mt-2 mb-4 text-xs font-semibold leading-5 text-muted-foreground">{helper}</p> : null}
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-muted-foreground">아이디/이메일</span>
          <input
            className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-muted-foreground">비밀번호</span>
          <input
            className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            type={passwordVisible ? "text" : "password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
