"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";

const noteTypes = [
  { label: "배송 특이사항", value: "delivery" },
  { label: "영업 상담", value: "sales" },
  { label: "일반 메모", value: "general" }
];

const quickMemos = ["정상 배송 완료", "도착 전 연락 필요", "적재위치 변경 요청", "다음 방문 때 견적 상담"];

export function MobileVisitNoteForm({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [memo, setMemo] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [noteType, setNoteType] = useState("delivery");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  function updateMemo(value: string) {
    setMemo(value);
    setErrorDetail("");
    if (status !== "idle") setStatus("idle");
  }

  function updateNextAction(value: string) {
    setNextAction(value);
    setErrorDetail("");
    if (status !== "idle") setStatus("idle");
  }

  async function submit() {
    const trimmedMemo = memo.trim();
    if (!trimmedMemo || saving) return;

    setSaving(true);
    setStatus("idle");
    setErrorDetail("");

    const response = await fetch("/api/customer-operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "note",
        customerId,
        memo: trimmedMemo,
        nextAction: nextAction.trim(),
        noteType
      })
    }).catch(() => null);

    setSaving(false);

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as { message?: string; error?: string } | null;
      setErrorDetail(payload?.message || payload?.error || "저장에 실패했습니다. 네트워크와 로그인 상태를 확인한 뒤 다시 시도해주세요.");
      setStatus("error");
      return;
    }

    setMemo("");
    setNextAction("");
    setLastSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    setStatus("saved");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" id="visit-memo">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <span className="mb-2 inline-flex rounded-full bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-800 ring-1 ring-inset ring-teal-100">3. 히스토리 기록</span>
          <p className="font-black text-slate-950">방문 메모 남기기</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{customerName} 현장 기록을 거래처 원장에 저장합니다.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <select
          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          value={noteType}
          onChange={(event) => setNoteType(event.target.value)}
        >
          {noteTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-2">
          {quickMemos.map((item) => (
            <button
              className="min-h-[2.75rem] rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-black text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
              key={item}
              onClick={() => updateMemo(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <textarea
          className="min-h-[108px] resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          placeholder="예: 후문 냉장창고 앞 적재 완료. 다음 배송부터 오전 9시 이전 도착 요청."
          value={memo}
          onChange={(event) => updateMemo(event.target.value)}
        />

        <input
          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          placeholder="다음 액션 예: 다음 배송 전 연락"
          value={nextAction}
          onChange={(event) => updateNextAction(event.target.value)}
        />
        <p className="-mt-1 text-xs font-bold leading-5 text-slate-500">메모와 다음 액션은 거래처 원장에서 담당자별 기록으로 확인합니다.</p>

        <Button className="h-11 bg-teal-700 font-black hover:bg-teal-800" disabled={!memo.trim() || saving} onClick={submit}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? "저장 중" : status === "saved" ? "저장 완료" : "히스토리에 저장"}
        </Button>

        {status === "error" ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-700 ring-1 ring-inset ring-rose-100">{errorDetail}</p> : null}
        {status === "saved" ? (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold leading-5 text-teal-700 ring-1 ring-inset ring-teal-100">
            {lastSavedAt ? `${lastSavedAt} 저장 완료 · ` : ""}거래처 원장에서 같은 기록을 확인할 수 있습니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
