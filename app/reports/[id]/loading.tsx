import { BarChart3, LoaderCircle } from "lucide-react";

export default function ReportLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1560px] items-center gap-3 px-4 py-5">
          <LoaderCircle className="h-5 w-5 animate-spin text-teal-700" />
          <div className="min-w-0">
            <p className="font-black text-slate-950">AI 리포트를 불러오는 중입니다</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-500">저장된 분석 결과와 우선 작업을 확인하고 있습니다.</p>
          </div>
        </div>
      </div>
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["거래처", "거래지역", "신규 기회", "배송거리"].map((label) => (
            <div className="rounded-xl border border-slate-200 bg-white p-4" key={label}>
              <BarChart3 className="h-5 w-5 text-slate-300" />
              <p className="mt-4 text-xs font-black text-slate-400">{label}</p>
              <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
          <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      </section>
    </main>
  );
}
