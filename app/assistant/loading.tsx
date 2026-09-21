import { LoaderCircle, MessageSquareText } from "lucide-react";

export default function AssistantLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1560px] items-center gap-3 px-4 py-5">
          <LoaderCircle className="h-5 w-5 animate-spin text-teal-700" />
          <div className="min-w-0">
            <p className="font-black text-slate-950">AI 영업 초안을 불러오는 중입니다</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-500">방문 기록과 견적 후속 항목을 확인하고 있습니다.</p>
          </div>
        </div>
      </div>
      <section className="mx-auto max-w-[1560px] space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {["초안", "후속 메시지", "견적 메모"].map((label) => (
            <div className="rounded-xl border border-slate-200 bg-white p-4" key={label}>
              <MessageSquareText className="h-5 w-5 text-slate-300" />
              <p className="mt-4 text-xs font-black text-slate-400">{label}</p>
              <div className="mt-2 h-7 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </section>
    </main>
  );
}
