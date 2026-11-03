"use client";

import { useEffect, useState } from "react";
import { withPermitLeadCompanyQuery } from "@/components/sales-route-map-workspace";

type HistoryItem = { actor: string; at: string; detail: string; id: string; kind: "record" | "void"; type: string };

const TYPE_LABELS: Record<string, string> = {
  call: "전화", dm: "DM", email: "이메일", exclude: "제외", fax: "팩스", hold: "정보 수정·보류", quote: "견적",
  sms: "문자", status: "단계 변경", talktalk: "톡톡", visit: "방문"
};

/** 11/4: 리드 수정 기록. 누가·언제·무엇을 했는지 시간순으로 보여줍니다(취소된 컨택 포함). */
export function LeadChangeHistory({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${encodeURIComponent(leadId)}/history`), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload: { items?: HistoryItem[] }) => { if (active) setItems(payload.items || []); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [leadId]);
  if (!items) return <p className="text-xs font-semibold text-slate-500">수정 기록을 불러오는 중입니다.</p>;
  if (!items.length) return <p className="text-xs font-semibold text-slate-500">아직 기록이 없습니다.</p>;
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((item) => (
        <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-xs" key={item.id}>
          <span className="w-[120px] shrink-0 font-semibold text-slate-500">{new Date(item.at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" })}</span>
          <span className={`rounded-full px-2 py-0.5 font-black ${item.kind === "void" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
            {item.kind === "void" ? `${TYPE_LABELS[item.type] || item.type} 기록 취소` : TYPE_LABELS[item.type] || item.type}
          </span>
          <span className="font-bold text-slate-800">{item.actor}</span>
          {item.detail ? <span className="min-w-0 basis-full whitespace-pre-line pl-[128px] font-medium text-slate-600">{item.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}
