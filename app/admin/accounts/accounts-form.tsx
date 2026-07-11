"use client";

import { FormEvent, useState } from "react";
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
    setMessage(payload.persisted ? "계정 정보가 저장되었습니다." : "샘플 모드로 반영되었습니다.");
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
          label="고객사 계정"
          password={form.customerPassword}
          passwordVisible={showPasswords}
          onEmailChange={(value) => update("customerEmail", value)}
          onPasswordChange={(value) => update("customerPassword", value)}
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-muted-foreground">고객사 회사 ID</span>
        <input
          className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          value={form.customerCompanyId}
          onChange={(event) => update("customerCompanyId", event.target.value)}
        />
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
      </div>
    </form>
  );
}

function AccountPanel({
  email,
  label,
  onEmailChange,
  onPasswordChange,
  password,
  passwordVisible
}: {
  email: string;
  label: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  password: string;
  passwordVisible: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-4">
      <p className="mb-4 font-black">{label}</p>
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
