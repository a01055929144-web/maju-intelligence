"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * 2026-08-31 완성도 감사 대응: "AI 영업" 초안 카드에 복사 버튼이 없어 사용자가 텍스트를 직접
 * 드래그 선택해야 했습니다(다른 화면의 견적/DM 문안엔 이미 복사 버튼이 있어 일관성이 없었음).
 * 여러 화면에서 재사용할 수 있도록 최소 기능만 담은 클라이언트 컴포넌트로 분리합니다.
 */
export function CopyTextButton({ className = "", label = "복사", text }: { className?: string; label?: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50 ${className}`}
      onClick={handleCopy}
      type="button"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-teal-700" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "복사됨" : label}
    </button>
  );
}
