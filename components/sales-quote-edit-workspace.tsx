"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MobileQuoteBuilder } from "@/components/mobile-quote-builder";
import type { SalesQuoteEditorData } from "@/lib/store";

export function SalesQuoteEditWorkspace({ quote }: { quote: SalesQuoteEditorData }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-xs font-semibold text-teal-700">{quote.status === "draft" ? "임시저장 견적" : "발행 견적 수정"}</p><h1 className="mt-1 text-xl font-bold text-slate-950">{quote.recipientName || quote.title}</h1><p className="mt-1 text-sm text-slate-500">{quote.quoteNumber} · 저장하면 같은 견적과 고객 링크가 갱신됩니다.</p></div>
        <Link className="maju-button-secondary shrink-0" href="/revenue/pipeline?section=quotes"><ArrowLeft className="h-4 w-4" />원장</Link>
      </div>
      <MobileQuoteBuilder
        contactMemo={quote.memo || "기존 견적 수정"}
        customerId={quote.customerId}
        initialQuote={quote}
        leadId={quote.leadId}
        onIssued={() => undefined}
        recipientName={quote.recipientName || "수신처"}
        recipientPhone={quote.recipientPhone}
      />
    </section>
  );
}
