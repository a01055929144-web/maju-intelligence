"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";

export default function ReportError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-2xl rounded-xl border border-rose-200 bg-white px-5 py-10 text-center shadow-sm sm:p-12">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-950">AI 리포트를 불러오지 못했습니다</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">저장된 리포트는 유지됩니다. 잠시 후 다시 시도하거나 지도 홈으로 돌아가 주세요.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button className="maju-button-primary justify-center" onClick={reset} type="button"><RotateCcw className="h-4 w-4" aria-hidden="true" />다시 시도</button>
          <Link className="maju-button-secondary justify-center" href="/dashboard"><ArrowLeft className="h-4 w-4" aria-hidden="true" />지도 홈</Link>
        </div>
      </section>
    </main>
  );
}
