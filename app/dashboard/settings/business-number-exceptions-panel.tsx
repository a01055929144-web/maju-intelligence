"use client";

import { useState } from "react";
import { Building2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BusinessNumberException } from "@/lib/store";

function isErrorMessage(message: string) {
  return ["실패", "오류", "않", "필요", "맞지"].some((keyword) => message.includes(keyword));
}

// 입력 중에도 자동으로 하이픈이 붙도록 하는 실시간 포맷터입니다.
function formatBusinessNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatBusinessNumberDisplay(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function BusinessNumberExceptionsPanel({ initialExceptions }: { initialExceptions: BusinessNumberException[] }) {
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [businessNumber, setBusinessNumber] = useState("");
  const [memo, setMemo] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState("");

  async function addException() {
    if (!businessNumber.trim() || creating) return;
    setCreating(true);
    setMessage("");

    const response = await fetch("/api/business-number-exceptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessRegistrationNumber: businessNumber, memo })
    });
    const payload = await response.json().catch(() => null);
    setCreating(false);

    if (!response.ok) {
      setMessage(payload?.message || "등록에 실패했습니다.");
      return;
    }

    setExceptions((current) => [payload.exception as BusinessNumberException, ...current.filter((item) => item.businessRegistrationNumber !== payload.exception.businessRegistrationNumber)]);
    setBusinessNumber("");
    setMemo("");
    setMessage(payload.persisted ? "중복 허용 사업자번호 저장이 완료되었습니다." : "화면에 반영되었습니다. 저장 상태는 시스템 점검에서 확인하세요.");
  }

  async function removeException(exception: BusinessNumberException) {
    setRemovingId(exception.id);
    setMessage("");

    const response = await fetch(`/api/business-number-exceptions?id=${encodeURIComponent(exception.id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    setRemovingId("");

    if (!response.ok) {
      setMessage(payload?.message || "삭제에 실패했습니다.");
      return;
    }

    setExceptions((current) => current.filter((item) => item.id !== exception.id));
    setMessage(`${formatBusinessNumberDisplay(exception.businessRegistrationNumber)} 항목을 삭제했습니다.`);
  }

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge className="mb-3 w-fit bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            중복 허용 사업자번호
          </Badge>
          <h2 className="text-2xl font-black text-slate-950">하나의 사업자번호로 여러 거래처를 운영하는 경우를 등록합니다</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            종사업자번호처럼 같은 사업자등록번호로 여러 지점(거래처)을 운영하는 경우, 여기에 등록하면 데이터 등록·업로드 시 자동 병합이나
            중복 경고 대상에서 제외되고 상호명+주소 기준으로 구분됩니다.
          </p>
        </div>
        <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{exceptions.length}건</Badge>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {exceptions.map((exception) => (
            <div key={exception.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="font-mono font-black text-slate-950">{formatBusinessNumberDisplay(exception.businessRegistrationNumber)}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">{exception.memo || "메모 없음"} · {exception.createdAt}</p>
              </div>
              <Button disabled={removingId === exception.id} onClick={() => removeException(exception)} type="button" variant="outline">
                <Trash2 className="h-4 w-4" />
                {removingId === exception.id ? "삭제 중" : "삭제"}
              </Button>
            </div>
          ))}
          {!exceptions.length ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold leading-6 text-slate-500">
              등록된 중복 허용 사업자번호가 없습니다. 종사업자번호 등으로 여러 거래처를 운영 중이라면 오른쪽에서 등록하세요.
            </div>
          ) : null}
        </div>

        <aside className="h-fit rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-black text-slate-950">사업자번호 등록</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">등록 후에는 이 사업자번호가 여러 거래처에 있어도 중복으로 처리되지 않습니다.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <input
              className="h-11 rounded-md border border-slate-200 bg-white px-3 font-mono text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              placeholder="123-45-67890"
              value={businessNumber}
              onChange={(event) => setBusinessNumber(formatBusinessNumberInput(event.target.value))}
            />
            <input
              className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
              placeholder="메모 (예: OO프랜차이즈 종사업자, 지점 3곳)"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
            />
            <Button className="h-11 bg-teal-700 font-black hover:bg-teal-800" disabled={!businessNumber.trim() || creating} onClick={addException} type="button">
              <Plus className="h-4 w-4" />
              {creating ? "등록 중" : "중복 허용 등록"}
            </Button>
          </div>
          {message ? (
            <p className={`mt-3 rounded-md px-3 py-2 text-xs font-bold leading-5 ${isErrorMessage(message) ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
              {message}
            </p>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
