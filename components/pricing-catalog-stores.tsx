"use client";

import { useCallback, useEffect, useState } from "react";
import { CatalogStoreLinkTable } from "./catalog-store-link-table";
import { ErrorState, LoadingState } from "./ui/state";

type Template = { id: string; name: string; storeCount?: number; margin: number; rounding: number; categories: { category: string; margin: number }[] };

export function PricingCatalogStores({ companyId }: { companyId: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/margin-templates?${new URLSearchParams({ companyId })}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "카탈로그를 불러오지 못했습니다.");
    setTemplates((body as { templates?: Template[] }).templates ?? []);
  }, [companyId]);

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "카탈로그를 불러오지 못했습니다.")); }, [load]);

  return <section aria-label="매장별 카탈로그" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div>
      <h2 className="text-base font-black">매장별 카탈로그</h2>
      <p className="mt-1 text-sm text-slate-600">어느 매장이 어떤 카탈로그 가격을 쓰는지 정합니다. 매장 하나만 따로 값을 바꾸려면 ‘매장 가격’을 이용하세요.</p>
    </div>
    {error ? <ErrorState message={error} /> : templates === null ? <LoadingState label="카탈로그를 불러오는 중…" /> : templates.length ? <CatalogStoreLinkTable companyId={companyId} templates={templates} userKey={companyId} /> : <p className="text-sm text-slate-600">먼저 카탈로그를 만들어 주세요.</p>}
  </section>;
}
