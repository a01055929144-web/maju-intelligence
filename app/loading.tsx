import { Loader2 } from "lucide-react";

export default function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm" role="status" aria-live="polite">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-teal-700" />
        <p className="mt-3 text-sm font-black text-slate-900">작업 진행 중입니다</p>
        <p className="mt-1 text-xs font-bold text-slate-500">데이터를 안전하게 불러오고 있습니다. 잠시만 기다려주세요.</p>
      </div>
    </main>
  );
}
