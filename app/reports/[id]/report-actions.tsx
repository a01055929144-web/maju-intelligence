"use client";

import { Check, Copy, Loader2, Printer, Share2 } from "lucide-react";
import { useState } from "react";

type ActionFeedback = {
  message: string;
  tone: "error" | "success" | "neutral";
};

export function ReportActions({ companyName }: { readonly companyName: string }) {
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  function saveAsPdf() {
    setFeedback({ message: "인쇄 창이 열립니다. 프린터에서 ‘PDF로 저장’을 선택하세요.", tone: "neutral" });
    try {
      window.print();
    } catch {
      setFeedback({ message: "인쇄 창을 열지 못했습니다. 브라우저 메뉴에서 ‘인쇄’를 선택해 주세요.", tone: "error" });
    }
  }

  async function copyReportLink() {
    if (isCopying) return;
    setIsCopying(true);
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setFeedback({ message: "리포트 링크를 복사했습니다. 메모나 대화창에 붙여넣어 다시 사용할 수 있습니다.", tone: "success" });
    } catch {
      setFeedback({ message: "링크를 복사하지 못했습니다. 주소창의 주소를 길게 눌러 직접 복사해 주세요.", tone: "error" });
    } finally {
      setIsCopying(false);
    }
  }

  async function shareReport() {
    if (isSharing) return;
    setIsSharing(true);
    setFeedback(null);
    const shareData = {
      text: `${companyName} AI 리포트`,
      title: `${companyName} AI 리포트`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setFeedback({ message: "리포트를 공유했습니다.", tone: "success" });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setFeedback({ message: "이 브라우저에서는 공유 창을 열 수 없어 리포트 링크를 대신 복사했습니다.", tone: "neutral" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setFeedback({ message: "공유를 취소했습니다. 리포트 내용은 그대로 유지됩니다.", tone: "neutral" });
        return;
      }
      setFeedback({ message: "공유하지 못했습니다. ‘링크 복사’를 눌러 직접 전달해 주세요.", tone: "error" });
    } finally {
      setIsSharing(false);
    }
  }

  const feedbackColor = feedback?.tone === "error"
    ? "text-red-700"
    : feedback?.tone === "success"
      ? "text-emerald-700"
      : "text-slate-600";

  return (
    <div className="w-full print:hidden sm:w-auto">
      <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <button className="maju-button-secondary min-h-11 touch-manipulation justify-center px-4 text-sm active:scale-[0.98]" onClick={saveAsPdf} type="button">
          <Printer aria-hidden="true" className="h-4 w-4" />
          인쇄 · PDF 저장
        </button>
        <button className="maju-button-secondary min-h-11 touch-manipulation justify-center px-4 text-sm active:scale-[0.98] disabled:cursor-wait disabled:opacity-60" disabled={isCopying} onClick={() => void copyReportLink()} type="button">
          {feedback?.tone === "success" && feedback.message.startsWith("리포트 링크") ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          {isCopying ? "복사 중" : "링크 복사"}
        </button>
        <button className="maju-button-secondary min-h-11 touch-manipulation justify-center px-4 text-sm active:scale-[0.98] disabled:cursor-wait disabled:opacity-60" disabled={isSharing} onClick={() => void shareReport()} type="button">
          {isSharing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Share2 aria-hidden="true" className="h-4 w-4" />}
          {isSharing ? "공유 준비 중" : "공유"}
        </button>
      </div>
      {feedback ? (
        <p aria-live={feedback.tone === "error" ? "assertive" : "polite"} className={`mt-2 max-w-xl text-xs font-medium leading-5 ${feedbackColor}`} role={feedback.tone === "error" ? "alert" : "status"}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
