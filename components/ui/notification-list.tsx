"use client";

import { useState, type ReactNode } from "react";
import { formatKstDate } from "@/domains/shared/kst-date";
import { EmptyState } from "@/components/ui/state";
import { diffNotificationValues, notificationStatus, sortNotifications, unreadCount, type CompanyNotification, type NotificationStatus } from "@/lib/notification-list";

// CC-56 공용 알림 목록: company_notifications 한 줄 = 한 항목. 새 알림 · 읽음 · 처리됨 표시, 읽음/처리 버튼, 값이 달라진 칸의 전후 비교.
// 화면 연결·API는 쓰는 화면(S-7b·S-2a)이 한다 — 이 부품은 목록과 버튼 모양만 가지고 onMarkRead·onProcess를 부른다.
const STATUS_LABEL: Record<NotificationStatus, string> = { new: "새 알림", read: "읽음", processed: "처리됨" };
const STATUS_CLASS: Record<NotificationStatus, string> = { new: "bg-teal-700 text-white", read: "bg-slate-100 text-slate-600", processed: "bg-slate-100 text-slate-500" };

type Props = {
  readonly items: readonly CompanyNotification[];
  /** notification_type → 제목. 없는 종류는 종류 이름 그대로. */
  readonly titles?: Readonly<Record<string, string>>;
  /** 전후 비교의 칸 이름. 없으면 매장 정보 변경 칸 이름을 쓴다. */
  readonly fieldLabels?: Readonly<Record<string, string>>;
  readonly onMarkRead?: (id: string) => void;
  /** 처리(예: 변경을 거래처에 반영). 안 주면 처리 버튼이 없다. */
  readonly onProcess?: (id: string) => void;
  /** 요청 중인 항목 id — 그 항목 버튼을 잠근다. */
  readonly busyId?: string | null;
  /** 항목 아래에 화면이 더 넣을 것(예: 주문 보기 링크). */
  readonly renderExtra?: (item: CompanyNotification) => ReactNode;
  readonly emptyMessage?: string;
};

export function NotificationList({ busyId = null, emptyMessage = "새 알림이 없습니다.", fieldLabels, items, onMarkRead, onProcess, renderExtra, titles = {} }: Props) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const sorted = sortNotifications(items);
  const unread = unreadCount(items);
  if (!sorted.length) return <EmptyState message={emptyMessage} />;
  return (
    <section aria-label="알림">
      <p className="mb-2 text-xs font-bold text-slate-500" role="status">안 읽은 알림 {unread.toLocaleString("ko-KR")}건 · 전체 {sorted.length.toLocaleString("ko-KR")}건</p>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {sorted.map((item) => {
          const status = notificationStatus(item);
          const diff = diffNotificationValues(item.beforeValues, item.afterValues, fieldLabels);
          const expanded = open.has(item.id);
          const busy = busyId === item.id;
          return (
            <li className={`p-3 ${status === "new" ? "bg-teal-50/40" : ""}`} data-status={status} key={item.id}>
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm text-slate-950 ${status === "new" ? "font-black" : "font-bold"}`}>{titles[item.notificationType] ?? item.notificationType}{item.subject ? ` · ${item.subject}` : ""}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{formatKstDate(item.createdAt, "datetime")}</p>
                </div>
              </div>
              {diff.length ? (
                <div className="mt-2">
                  <button aria-expanded={expanded} className="text-xs font-bold text-teal-700 underline" onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} type="button">{expanded ? "전후 비교 접기" : `전후 비교 보기 (${diff.length}칸)`}</button>
                  {expanded ? (
                    <table className="mt-2 w-full table-fixed text-xs">
                      <thead><tr className="text-left text-slate-500"><th className="w-1/4 py-1 font-bold">항목</th><th className="w-[37.5%] py-1 font-bold">이전</th><th className="w-[37.5%] py-1 font-bold">변경 후</th></tr></thead>
                      <tbody>{diff.map((row) => <tr className="border-t border-slate-100" key={row.key}><th className="py-1 text-left font-bold text-slate-700" scope="row">{row.label}</th><td className="break-words py-1 text-slate-500">{row.before || "(비어 있음)"}</td><td className="break-words py-1 font-bold text-slate-950">{row.after || "(비어 있음)"}</td></tr>)}</tbody>
                    </table>
                  ) : null}
                </div>
              ) : null}
              {renderExtra?.(item)}
              {status !== "processed" && (onMarkRead || onProcess) ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {status === "new" && onMarkRead ? <button className="maju-button-secondary h-8 text-xs" disabled={busy} onClick={() => onMarkRead(item.id)} type="button">읽음 표시</button> : null}
                  {onProcess ? <button className="maju-button-secondary h-8 text-xs" disabled={busy} onClick={() => onProcess(item.id)} type="button">{busy ? "처리 중…" : "처리"}</button> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
