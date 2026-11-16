"use client";
import { useEffect, useState } from "react";
import { NotificationList } from "./ui/notification-list";
import { ErrorState, LoadingState } from "./ui/state";
import { Notice } from "./ui/notice";
import type { CompanyNotification } from "@/lib/notification-list";

export function StoreNotificationSettings() {
  const [items, setItems] = useState<CompanyNotification[] | null>(null), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const load = () => fetch("/api/customer/store-notifications", { cache: "no-store" }).then(async response => {
    const body = await response.json(); if (!response.ok) throw new Error(body.message); setItems(body.items);
  }).catch(cause => setError(cause instanceof Error ? cause.message : "알림을 불러오지 못했습니다."));
  useEffect(() => { void load(); }, []);
  const act = async (id: string, action: "read" | "process") => {
    const item = items?.find(value => value.id === id); setBusy(id); setError("");
    try { const response = await fetch("/api/customer/store-notifications", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, type: item?.notificationType }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "알림을 처리하지 못했습니다."); } finally { setBusy(null); }
  };
  if (!items && !error) return <LoadingState label="매장 알림을 불러오는 중입니다." />;
  if (!items) return <ErrorState message={error} onRetry={load} />;
  return <div className="space-y-3">{error ? <Notice kind="error">{error}</Notice> : null}<NotificationList busyId={busy} items={items}
    onMarkRead={id => void act(id, "read")} onProcess={id => void act(id, "process")}
    titles={{ new_store: "새 매장 확인", store_review_required: "새 매장 확인 필요", store_profile_changed: "매장 정보 바뀜" }} /></div>;
}
