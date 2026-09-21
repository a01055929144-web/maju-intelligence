import { LoaderCircle } from "lucide-react";

export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-slate-50" aria-busy="true" aria-live="polite">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-5">
          <LoaderCircle className="h-5 w-5 animate-spin text-teal-700" />
          <div>
            <p className="font-black text-slate-950">관리자 화면을 불러오는 중입니다</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">운영 데이터와 시스템 상태를 확인하고 있습니다.</p>
          </div>
        </div>
      </div>
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" key={item} />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </section>
    </main>
  );
}
