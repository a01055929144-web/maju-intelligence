"use client";

import { useState } from "react";
import { AlertTriangle, Download, EyeOff, Loader2, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SENSITIVE_ACCESS_ITEMS, SENSITIVE_ACCESS_WARNING_CODES, type SensitiveAccessLog } from "@/domains/organization/sensitive-access-log";

const itemLabels = { access_password: "출입 비밀번호", owner_phone: "사장님 휴대폰", business_registration: "사업자등록증", export: "엑셀 내보내기", log_hidden: "기록 숨김" } as const;
const warningLabels = { unassigned: "담당 아님", outside_work_session: "근무 외", daily_20_plus: "하루 20회+", export: "내보내기" } as const;

export function SensitiveAccessLogPanel({ enabled, initialRecords }: { enabled: boolean; initialRecords: SensitiveAccessLog[] }) {
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState("");
  const [item, setItem] = useState("");
  const [warning, setWarning] = useState("");
  const [includeHidden, setIncludeHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRecords() {
    if (!enabled) return;
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ includeHidden: String(includeHidden) });
    if (query.trim()) params.set("query", query.trim());
    if (item) params.set("item", item);
    if (warning) params.set("warning", warning);
    const response = await fetch(`/api/customer/security/sensitive-access-logs?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setLoading(false);
    if (!response?.ok) return setMessage(payload?.message || "열람 기록을 불러오지 못했습니다.");
    setRecords(Array.isArray(payload.records) ? payload.records : []);
  }

  async function hideRecord(logId: string) {
    const response = await fetch("/api/customer/security/sensitive-access-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId })
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    if (!response?.ok) return setMessage(payload?.message || "기록을 숨기지 못했습니다.");
    setRecords((current) => includeHidden ? current.map((record) => record.id === logId ? { ...record, hiddenAt: payload.hiddenAt } : record) : current.filter((record) => record.id !== logId));
    setMessage("기록을 숨겼습니다. 숨김 작업도 감사 기록에 남습니다.");
  }

  async function exportRecords() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/customer/security/sensitive-access-logs/export", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null);
      setLoading(false);
      return setMessage(payload?.message || "열람 기록을 내보내지 못했습니다.");
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "sensitive-access-logs-latest-200.csv";
    link.click();
    URL.revokeObjectURL(url);
    setLoading(false);
    setMessage("내보내기 작업도 감사 기록에 남았습니다.");
  }

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700"><ShieldCheck className="h-5 w-5" /></span>
        <div><h2 className="text-xl font-black text-slate-950">민감정보 열람 기록</h2><p className="mt-1 text-sm text-slate-500">값 자체는 저장하지 않고 누가·언제·어디서 어떤 항목을 열었는지만 기록합니다.</p></div>
      </div>

      {!enabled ? (
        <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="status">
          <p className="font-black">서버 경유 열람 준비 완료 · 운영 승인 대기</p>
          <p className="mt-1">출입 비밀번호 reveal API는 최신 권한 재검증 → 감사 선기록 → 값 반환 순서로 준비됐습니다. 기존 화면의 원문 전달 제거와 N3 SQL 운영 검증 전까지 조회·기록·민감값 열람 기능은 모두 꺼져 있습니다.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto_auto]">
            <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><span className="sr-only">직원·매장·기기 검색</span><input className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="직원·매장·기기 검색" value={query} /></label>
            <select aria-label="민감정보 항목" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" onChange={(event) => setItem(event.target.value)} value={item}><option value="">모든 항목</option>{SENSITIVE_ACCESS_ITEMS.map((value) => <option key={value} value={value}>{itemLabels[value]}</option>)}</select>
            <select aria-label="주의 유형" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" onChange={(event) => setWarning(event.target.value)} value={warning}><option value="">모든 주의</option>{SENSITIVE_ACCESS_WARNING_CODES.map((value) => <option key={value} value={value}>{warningLabels[value]}</option>)}</select>
            <Button disabled={loading} onClick={loadRecords} type="button">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}조회</Button>
            <Button disabled={loading} onClick={exportRecords} type="button" variant="outline"><Download className="h-4 w-4" />최근 200건 내보내기</Button>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 md:col-span-5"><input checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} type="checkbox" />숨긴 기록 보기</label>
          </div>
          {message ? <p aria-live="polite" className="mx-4 mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{message}</p> : null}
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="px-3 py-2">시각</th><th className="px-3 py-2">사용자</th><th className="px-3 py-2">매장</th><th className="px-3 py-2">항목</th><th className="px-3 py-2">기기·경로</th><th className="px-3 py-2">주의</th><th className="px-3 py-2">관리</th></tr></thead>
              <tbody>{records.map((record) => <tr className={`border-b border-slate-100 ${record.hiddenAt ? "opacity-50" : ""}`} key={record.id}><td className="px-3 py-3 font-medium">{new Date(record.accessedAt).toLocaleString("ko-KR")}</td><td className="px-3 py-3"><p className="font-bold text-slate-900">{record.actorName}</p><p className="text-xs text-slate-500">{record.actorRole}</p></td><td className="px-3 py-3">{record.storeName}</td><td className="px-3 py-3 font-bold">{itemLabels[record.item]}</td><td className="px-3 py-3"><p>{record.deviceLabel}</p><p className="text-xs text-slate-500">{record.pagePath}</p></td><td className="px-3 py-3">{record.warningCodes.length ? <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-4 w-4" />{record.warningCodes.map((code) => warningLabels[code]).join(" · ")}</span> : "-"}</td><td className="px-3 py-3">{record.hiddenAt ? "숨김" : <button className="inline-flex items-center gap-1 font-bold text-slate-500 hover:text-slate-900" onClick={() => hideRecord(record.id)} type="button"><EyeOff className="h-4 w-4" />숨김</button>}</td></tr>)}</tbody>
            </table>
            {!records.length ? <p className="py-10 text-center text-sm font-bold text-slate-500">조건에 맞는 열람 기록이 없습니다.</p> : null}
          </div>
        </>
      )}
    </section>
  );
}
