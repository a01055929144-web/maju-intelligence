"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

/**
 * 고객사 탈퇴(회사 계정 전체 삭제)입니다. 대표(오너)만 볼 수 있고, 실수로 누르는 걸 막기 위해
 * 정확한 회사명을 입력해야 버튼이 활성화됩니다. 하드 삭제가 아니라 비활성화 방식이라 데이터는
 * 남고 로그인만 막힙니다(관리자에게 요청하면 복구 가능). 활성 구독이 있으면 자동으로 해지됩니다.
 */
export function CompanyClosurePanel({ companyName }: { companyName: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const matches = confirmText.trim() === companyName.trim();

  async function closeCompany() {
    const confirmed = window.confirm(
      `정말 "${companyName}" 회사를 탈퇴 처리하시겠습니까?\n모든 직원의 로그인이 즉시 막히고, 활성 구독이 있으면 자동으로 해지됩니다.\n데이터는 삭제되지 않고 남지만, 다시 쓰려면 별도로 관리자에게 복구를 요청해야 합니다.`
    );
    if (!confirmed) return;

    setClosing(true);
    setError("");
    const response = await fetchWithTimeout(
      "/api/customer/company/close",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmCompanyName: confirmText })
      },
      12000
    ).catch(() => null);
    const payload = await response?.json().catch(() => null);

    if (!response?.ok) {
      setClosing(false);
      setError(payload?.message || "회사 탈퇴 처리에 실패했습니다.");
      return;
    }

    window.location.href = "/dashboard/login";
  }

  return (
    <section className="maju-section-card border-rose-200">
      <div className="maju-card-header">
        <Badge className="mb-3 w-fit bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-100">
          <AlertTriangle className="mr-1 h-3.5 w-3.5" />
          위험 구역
        </Badge>
        <h2 className="text-2xl font-black text-slate-950">회사 탈퇴</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          회사 계정을 탈퇴 처리합니다. 모든 직원의 로그인이 즉시 막히고 활성 구독은 자동으로 해지됩니다. 데이터는 바로 삭제되지 않지만, 이 화면에서 되돌릴 수 없습니다.
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:max-w-md">
        <label className="text-xs font-bold text-slate-500">
          확인을 위해 회사명 <span className="font-black text-slate-900">&quot;{companyName}&quot;</span>을(를) 정확히 입력하세요.
        </label>
        <input
          className="h-11 rounded-md border border-rose-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={companyName}
          value={confirmText}
        />
        <Button className="h-11 bg-rose-600 font-black hover:bg-rose-700" disabled={!matches || closing} onClick={closeCompany} type="button">
          {closing ? "탈퇴 처리 중" : "회사 탈퇴하기"}
        </Button>
        {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-700">{error}</p> : null}
      </div>
    </section>
  );
}
