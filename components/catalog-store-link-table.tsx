"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommonDataTable, type CommonTableColumn } from "./common-data-table";

// CC-32b: 매장 연결 표 — 공용 표 v3(전체/일부 선택·검색)로 매장을 고르고 카탈로그를 한꺼번에 연결한다.
// 선택한 매장은 100곳씩 나눠 보낸다(서버 1회 100곳 제한). 매장 등급 필터는 스위치(STORE_GRADES)를 켠 회사에서만 값이 있다.
type Template = { id: string; name: string };
type Store = { id: string; name: string; templateId: string | null; gradeId: string | null };

export function CatalogStoreLinkTable({ companyId, templates, userKey }: { companyId: string; templates: Template[]; userKey: string }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [grades, setGrades] = useState<Array<{ id: string; name: string }>>([]);
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/margin-templates/customers?${new URLSearchParams({ companyId, all: "1" })}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { customers?: Store[]; message?: string };
      if (!response.ok) throw new Error(body.message || "매장을 불러오지 못했습니다.");
      setStores(body.customers ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "매장을 불러오지 못했습니다."); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void fetch(`/api/store-grades?${new URLSearchParams({ companyId })}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b: { grades?: Array<{ id: string; name: string }> } | null) => setGrades(b?.grades ?? [])).catch(() => undefined);
  }, [companyId]);

  const templateName = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);
  const gradeName = useMemo(() => new Map(grades.map((g) => [g.id, g.name])), [grades]);

  const columns: CommonTableColumn<Store>[] = useMemo(() => [
    { key: "name", label: "매장", value: (s) => s.name, sortable: true, searchable: true, weight: 3, render: (s) => <span className="font-semibold">{s.name}</span> },
    { key: "catalog", label: "카탈로그", value: (s) => (s.templateId ? templateName.get(s.templateId) ?? "" : "기본"), sortable: true, width: 160 },
    ...(grades.length ? [{ key: "grade", label: "매장 등급", value: (s: Store) => (s.gradeId ? gradeName.get(s.gradeId) ?? "" : "없음"), sortable: true, width: 120 }] : []),
  ], [templateName, gradeName, grades.length]);

  // 선택한 매장을 고른 카탈로그로 연결(100곳씩). 던지면 그 묶음의 줄이 실패로 표시된다.
  const link = useCallback(async (batch: string[]) => {
    const response = await fetch("/api/margin-templates/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, customerIds: batch, templateId: target || null }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string }; throw new Error(body.message || "연결하지 못했습니다."); }
    setStores((current) => current.map((s) => (batch.includes(s.id) ? { ...s, templateId: target || null } : s)));
    setMessage("연결했습니다. 다음 주문부터 이 카탈로그 가격이 적용되고, 이미 보낸 문서는 그대로입니다(매장 개별 가격이 있으면 그쪽이 우선).");
  }, [companyId, target]);

  return <section aria-label="매장 연결" className="space-y-2 border-t pt-3">
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm font-bold">매장에 카탈로그 연결</p>
      <label className="flex items-center gap-1 text-xs font-bold text-slate-600">연결할 카탈로그
        <select aria-label="연결할 카탈로그" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" onChange={(e) => setTarget(e.target.value)} value={target}>
          <option value="">기본</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
    </div>
    {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p> : null}
    {message ? <p className="rounded border border-teal-300 bg-teal-50 p-2 text-sm text-teal-900" role="status">{message}</p> : null}
    <CommonDataTable bulkActions={[{ label: "선택한 매장 연결", run: link }]} columns={columns} emptyMessage="표시할 매장이 없습니다." facets={grades.length ? [{ key: "grade", label: "매장 등급", value: (s) => (s.gradeId ? gradeName.get(s.gradeId) : "없음") }] : undefined} filename="매장-카탈로그.csv" rowKey={(s) => s.id} rows={stores} settingsKey={`catalog-store-link:${userKey}`} />
  </section>;
}
