"use client";
import { useEffect, useState } from "react";
import { NotificationList } from "./ui/notification-list";
import { ErrorState, LoadingState } from "./ui/state";
import { Notice } from "./ui/notice";
import type { CompanyNotification } from "@/lib/notification-list";

export function StoreNotificationSettings() {
  const [items, setItems] = useState<CompanyNotification[] | null>(null), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [hidden, setHidden] = useState(false);
  const load = () => fetch("/api/customer/store-notifications", { cache: "no-store" }).then(async response => {
    const body = await response.json(); if (response.status === 404) { setHidden(true); return; } if (!response.ok) throw new Error(body.message); setHidden(false); setItems(body.items);
  }).catch(cause => setError(cause instanceof Error ? cause.message : "알림을 불러오지 못했습니다."));
  useEffect(() => { void load(); const reload = () => void load(); window.addEventListener("company-notifications:reload", reload); return () => window.removeEventListener("company-notifications:reload", reload); }, []);
  const act = async (id: string, action: "read" | "process" | "ignore") => {
    const item = items?.find(value => value.id === id); setBusy(id); setError("");
    try { const response = await fetch("/api/customer/store-notifications", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, type: item?.notificationType }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "알림을 처리하지 못했습니다."); } finally { setBusy(null); }
  };
  if (hidden) return null;
  if (!items && !error) return <LoadingState label="매장 알림을 불러오는 중입니다." />;
  if (!items) return <ErrorState message={error} onRetry={load} />;
  const counts = Object.fromEntries(["new_order", "new_store", "store_review_required", "store_profile_changed"].map(type => [type, items.filter(item => item.notificationType === type && !item.processedAt).length]));
  return <section className="space-y-3 rounded-xl border bg-slate-50 p-3" aria-label="회사 알림"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">회사 알림</h2>
    <span className="rounded-full bg-white px-2 py-1 text-xs font-bold">새 주문 {counts.new_order}</span><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">새 매장 {counts.new_store + counts.store_review_required}</span><span className="rounded-full bg-white px-2 py-1 text-xs font-bold">정보 변경 {counts.store_profile_changed}</span></div>
    {error ? <Notice kind="error">{error}</Notice> : null}<NotificationList busyId={busy} canIgnore={item => item.notificationType === "store_profile_changed"} canProcess={item => item.notificationType !== "new_order"} items={items} processLabel="매출처에 반영"
    onIgnore={id => void act(id, "ignore")} onMarkRead={id => void act(id, "read")} onProcess={id => void act(id, "process")}
    titles={{ new_order: "새 주문", new_store: "새 매장 확인", store_review_required: "새 매장 확인 필요", store_profile_changed: "매장 정보 바뀜" }} /></section>;
}
