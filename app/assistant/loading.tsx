import { Sparkles } from "lucide-react";

export default function SalesAssistantLoading() {
  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-8" aria-busy="true" aria-live="polite">
      <section className="mx-auto max-w-[1560px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
            <Sparkles className="h-6 w-6 animate-pulse" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-bold text-slate-950">영업 초안을 불러오는 중입니다</h1>
          <p className="mt-2 text-sm text-slate-500">방문 기록과 저장된 초안을 확인하고 있습니다.</p>
          <div className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-teal-600" />
          </div>
        </div>
      </section>
    </main>
  );
}
