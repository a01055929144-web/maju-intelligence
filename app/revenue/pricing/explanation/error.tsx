"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PriceExplanationError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  useEffect(() => {
    console.error("price explanation failed", error);
  }, [error]);

  return <main className="mx-auto flex min-h-[50vh] w-full max-w-2xl items-center px-4 py-10">
    <section className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6" role="alert">
      <h1 className="text-xl font-bold text-amber-950">단가 근거를 불러오지 못했습니다</h1>
      <p className="mt-2 text-sm leading-6 text-amber-900">잠시 후 다시 시도해 주세요. 이 오류 때문에 가격이 변경되지는 않습니다.</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button className="min-h-11 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white hover:bg-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" onClick={reset} type="button">다시 시도</button>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700" href="/revenue/pricing/catalog">카탈로그로 돌아가기</Link>
      </div>
    </section>
  </main>;
}
