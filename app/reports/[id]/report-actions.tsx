"use client";

import { Download, Share2 } from "lucide-react";
import { useState } from "react";

export function ReportActions({ companyName }: { readonly companyName: string }) {
  const [message, setMessage] = useState("");

  function saveAsPdf() {
    setMessage("인쇄 창에서 PDF로 저장할 수 있습니다.");
    window.print();
  }

  async function shareReport() {
    const shareData = {
      text: `${companyName} AI 리포트`,
      title: `${companyName} AI 리포트`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setMessage("리포트를 공유했습니다.");
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setMessage("공유 링크를 복사했습니다.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("공유하지 못했습니다. 주소창의 링크를 복사해주세요.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="maju-button-secondary h-10 px-4 text-sm" onClick={saveAsPdf} type="button">
        <Download className="h-4 w-4" />
        PDF 저장
      </button>
      <button className="maju-button-secondary h-10 px-4 text-sm" onClick={() => void shareReport()} type="button">
        <Share2 className="h-4 w-4" />
        공유
      </button>
      {message ? <span className="w-full text-xs font-medium text-slate-500 sm:w-auto" role="status">{message}</span> : null}
    </div>
  );
}
