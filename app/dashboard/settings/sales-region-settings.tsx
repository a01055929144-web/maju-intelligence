"use client";

import { SalesAreaSelector } from "@/components/sales-area-selector";

export function SalesRegionSettings() {
  return (
    <section className="maju-section-card p-5">
      <h2 className="text-lg font-black text-slate-950">영업 지역</h2>
      <p className="mt-1 text-sm text-slate-500">
        정부·서울 신규 리드 수집, 카카오 연락처 보강, 영업 리드 키워드 검색에 같은 지역을 사용합니다.
      </p>
      <div className="mt-4">
        <SalesAreaSelector />
      </div>
    </section>
  );
}
