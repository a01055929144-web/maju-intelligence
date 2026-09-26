"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";

export default function SalesAssistantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-8">
      <section className="mx-auto max-w-[1560px] overflow-hidden rounded-xl border border-rose-200 bg-white shadow-sm">
        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-bold text-slate-950">영업 초안을 불러오지 못했습니다</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">저장된 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button className="maju-button-primary justify-center" onClick={reset} type="button"><RotateCcw className="h-4 w-4" aria-hidden="true" />다시 시도</button>
            <Link className="maju-button-secondary justify-center" href="/dashboard"><ArrowLeft className="h-4 w-4" aria-hidden="true" />지도 홈</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
