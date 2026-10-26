"use client";

// 리드 상세의 "영업 채널" 패널(2026-10-25).
// 순서: 문자(010) → 인스타 DM → 네이버 톡톡 → 이메일 → 팩스 → 방문. 매장 유선 번호는 참고로만 보여 줍니다.
// 인스타·톡톡은 외부 발송 API가 없어 "열기 + 문구 복사 + 보냈음 기록"으로 처리하고,
// 팩스는 팩스 서비스 연동 전까지 "문구 복사 + 보냈음 기록"만 합니다(보낸 척하지 않습니다).
// 채널 순위·형식 검사·링크 생성 규칙은 domains/lead/contact-channels.ts가 가지고, 이 컴포넌트는 화면만 담당합니다.

import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Mail, MessageCircle, MessageSquare, Printer, Smartphone } from "lucide-react";
import {
  buildInstagramDmUrl,
  buildMailtoUrl,
  buildNaverMapSearchUrl,
  buildSmsUrl,
  extractInstagramHandle,
  formatKoreanPhoneNumber,
  isMobilePhoneNumber,
  LEAD_CONTACT_CHANNEL_LABELS,
  type LeadContactChannel,
  resolvePrimaryLeadContactChannel
} from "@/domains/lead/contact-channels";
import {
  buildLeadSourceDisclosure,
  leadSourceLabel,
  requiresAfterHoursConfirmation,
  SALES_OUTREACH_RULES
} from "@/domains/lead/outreach-governance";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { PermitLeadItem } from "@/lib/store";
import {
  buildLeadDmScript,
  type PermitLeadActionKind,
  type PermitLeadActionResult,
  withPermitLeadCompanyQuery
} from "@/components/sales-route-map-workspace";

type EditableChannel = "fax" | "email" | "naverTalktalkUrl";

const CHANNEL_ACTION: Record<Exclude<LeadContactChannel, "visit">, { actionType: PermitLeadActionKind; result: string }> = {
  sms: { actionType: "sms", result: "문자 발송" },
  instagram: { actionType: "dm", result: "DM 발송" },
  talktalk: { actionType: "talktalk", result: "톡톡 발송" },
  email: { actionType: "email", result: "이메일 발송" },
  fax: { actionType: "fax", result: "팩스 발송" }
};

const INPUT_LABEL: Record<EditableChannel, { label: string; placeholder: string }> = {
  naverTalktalkUrl: { label: "톡톡 주소", placeholder: "talk.naver.com/… (네이버 지도에서 톡톡 누른 뒤 주소 복사)" },
  email: { label: "이메일", placeholder: "owner@example.com" },
  fax: { label: "팩스", placeholder: "02-555-1234" }
};

export function LeadContactChannelsPanel({
  lead,
  onAction,
  onLeadUpdated
}: {
  readonly lead: PermitLeadItem;
  readonly onAction: (lead: PermitLeadItem, actionType: PermitLeadActionKind, result?: string, memo?: string, followUpAt?: string) => Promise<PermitLeadActionResult>;
  readonly onLeadUpdated: (lead: PermitLeadItem) => void;
}) {
  const [message, setMessage] = useState(() => buildLeadDmScript(lead));
  const [drafts, setDrafts] = useState<Record<EditableChannel, string>>({
    fax: lead.fax || "",
    email: lead.email || "",
    naverTalktalkUrl: lead.naverTalktalkUrl || ""
  });
  const [editing, setEditing] = useState<EditableChannel | null>(null);
  const [saving, setSaving] = useState<EditableChannel | null>(null);
  const [recording, setRecording] = useState<LeadContactChannel | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setMessage(buildLeadDmScript(lead));
    setDrafts({ fax: lead.fax || "", email: lead.email || "", naverTalktalkUrl: lead.naverTalktalkUrl || "" });
    setEditing(null);
    setNotice(null);
    // 다른 리드로 바뀔 때만 초기화합니다(같은 리드의 저장 결과 반영 때 작성 중인 문구를 지우지 않도록).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const mobile = isMobilePhoneNumber(lead.phone) ? formatKoreanPhoneNumber(lead.phone) : undefined;
  const storePhone = lead.phone && !mobile ? formatKoreanPhoneNumber(lead.phone) : undefined;
  const instagramHandle = extractInstagramHandle(lead.instagramUrl);
  const primary = useMemo(
    () =>
      resolvePrimaryLeadContactChannel({
        phone: lead.phone,
        instagramUrl: lead.instagramUrl,
        naverTalktalkUrl: lead.naverTalktalkUrl,
        email: lead.email,
        fax: lead.fax
      }),
    [lead.email, lead.fax, lead.instagramUrl, lead.naverTalktalkUrl, lead.phone]
  );

  async function copyMessage(text = message) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ tone: "ok", text: "문구를 복사했습니다. 열린 창에 붙여 넣어 보내 주세요." });
      return true;
    } catch {
      setNotice({ tone: "error", text: "복사 권한이 없어 문구를 직접 선택해 복사해 주세요." });
      return false;
    }
  }

  async function recordSent(channel: Exclude<LeadContactChannel, "visit">) {
    const config = CHANNEL_ACTION[channel];
    setRecording(channel);
    setNotice(null);
    try {
      const saved = await onAction(lead, config.actionType, config.result, message.slice(0, 500));
      setNotice(saved.ok ? { tone: "ok", text: `${LEAD_CONTACT_CHANNEL_LABELS[channel]} 보낸 기록을 남겼습니다.` } : { tone: "error", text: saved.message || "기록하지 못했습니다." });
    } finally {
      setRecording(null);
    }
  }

  async function copySourceDisclosure() {
    const disclosure = buildLeadSourceDisclosure({ businessName: lead.businessName, collectedAt: lead.createdAt, source: lead.source });
    const copied = await copyMessage(disclosure);
    if (!copied) return;
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/source-disclosure`),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        12000
      );
      const payload = (await response.json().catch(() => null)) as { message?: string; ok?: boolean } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "출처 안내 기록을 남기지 못했습니다.");
      setNotice({ tone: "ok", text: "출처 답변을 복사하고 안내 기록을 남겼습니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? `문구는 복사했지만 ${error.message}` : "문구는 복사했지만 출처 안내 기록을 남기지 못했습니다." });
    }
  }

  function confirmAfterHoursSms(event: MouseEvent<HTMLAnchorElement>) {
    if (!requiresAfterHoursConfirmation()) return;
    if (!window.confirm("현재는 문자 발송을 피해야 하는 시간(21:00~08:00)입니다. 그래도 문자 앱을 여시겠습니까?")) event.preventDefault();
  }

  async function saveChannel(key: EditableChannel) {
    setSaving(key);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}`),
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: drafts[key].trim() || null }) },
        12000
      );
      const payload = (await response.json().catch(() => null)) as { lead?: PermitLeadItem; message?: string; ok?: boolean } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "저장하지 못했습니다.");
      if (payload.lead) {
        onLeadUpdated(payload.lead);
        setDrafts((current) => ({ ...current, [key]: (payload.lead?.[key] as string | undefined) || "" }));
      }
      setEditing(null);
      setNotice({ tone: "ok", text: `${INPUT_LABEL[key].label}을(를) 저장했습니다.` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "저장하지 못했습니다." });
    } finally {
      setSaving(null);
    }
  }

  function renderEditor(key: EditableChannel) {
    return (
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          aria-label={INPUT_LABEL[key].label}
          autoFocus
          className="min-h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          inputMode={key === "fax" ? "tel" : key === "email" ? "email" : "url"}
          onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveChannel(key);
            if (event.key === "Escape") setEditing(null);
          }}
          placeholder={INPUT_LABEL[key].placeholder}
          value={drafts[key]}
        />
        <button className="maju-button-primary min-h-11 px-3 text-xs disabled:opacity-50" disabled={saving === key} onClick={() => void saveChannel(key)} type="button">
          {saving === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          저장
        </button>
        <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => setEditing(null)} type="button">
          취소
        </button>
      </div>
    );
  }

  function sentButton(channel: Exclude<LeadContactChannel, "visit">) {
    return (
      <button className="maju-button-secondary min-h-11 px-3 text-xs disabled:opacity-50" disabled={Boolean(recording)} onClick={() => void recordSent(channel)} type="button">
        {recording === channel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        보냈어요
      </button>
    );
  }

  const rowClass = (channel: LeadContactChannel) =>
    `rounded-lg border p-2.5 ${primary === channel ? "border-2 border-teal-500 bg-teal-50 shadow-sm" : "border-slate-200 bg-white"}`;
  const rowTitle = (channel: LeadContactChannel, icon: ReactNode, value?: string) => (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-slate-500">{icon}</span>
      <span className="text-xs font-black text-slate-900">{LEAD_CONTACT_CHANNEL_LABELS[channel]}</span>
      {primary === channel ? <span className="rounded-full bg-teal-700 px-1.5 py-0.5 text-[10px] font-black text-white">먼저</span> : null}
      <span className={`min-w-0 truncate text-xs font-semibold ${value ? "text-slate-700" : "text-slate-400"}`}>{value || "없음"}</span>
    </div>
  );

  return (
    <section aria-label="영업 채널" className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-950">영업 채널</p>
        <span className="text-[11px] font-bold text-slate-500">먼저: {LEAD_CONTACT_CHANNEL_LABELS[primary]}</span>
      </div>

      <label className="mt-2 block text-[11px] font-black text-slate-600">
        보낼 문구 (이번에만 고쳐도 됨)
        <textarea
          className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-semibold leading-5 text-slate-800 outline-none focus:border-teal-400 focus:bg-white"
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          value={message}
        />
      </label>
      <div aria-label="보낼 문구 미리보기" className="mt-2 flex justify-end rounded-xl bg-slate-100 p-3">
        <div className="max-w-[88%] whitespace-pre-line rounded-2xl rounded-br-sm bg-teal-700 px-3 py-2 text-xs font-semibold leading-5 text-white shadow-sm">
          {message || "보낼 문구를 입력하면 여기에 표시됩니다."}
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-blue-950">연락처·매장 정보 출처</p>
            <p className="mt-0.5 text-[11px] font-semibold text-blue-800">{leadSourceLabel(lead.source)} · {new Date(lead.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 확인</p>
          </div>
          <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => void copySourceDisclosure()} type="button">
            <Copy className="h-3.5 w-3.5" />
            출처 답변 복사·기록
          </button>
        </div>
      </div>

      <details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-black text-amber-950">영업 수칙 다시 보기</summary>
        <ul className="list-disc space-y-1 pb-2 pl-5 text-[11px] font-semibold leading-5 text-amber-900">
          {SALES_OUTREACH_RULES.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </details>

      <div className="mt-2 grid gap-2">
        <div className={rowClass("sms")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rowTitle("sms", <Smartphone className="h-3.5 w-3.5" />, mobile)}
            {mobile ? (
              <div className="flex gap-1.5">
                <a className={`maju-button-primary min-h-11 px-3 text-xs ${primary === "sms" ? "text-sm" : ""}`} href={buildSmsUrl(mobile, message)} onClick={confirmAfterHoursSms}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  문자 열기
                </a>
                {sentButton("sms")}
              </div>
            ) : null}
          </div>
        </div>

        <div className={rowClass("instagram")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rowTitle("instagram", <MessageCircle className="h-3.5 w-3.5" />, instagramHandle ? `@${instagramHandle}` : undefined)}
            {instagramHandle ? (
              <div className="flex gap-1.5">
                <a
                  className={`maju-button-primary min-h-11 px-3 text-xs ${primary === "instagram" ? "text-sm" : ""}`}
                  href={buildInstagramDmUrl(instagramHandle)}
                  onClick={() => void copyMessage()}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  DM 열기 · 문구 복사
                </a>
                {sentButton("instagram")}
              </div>
            ) : (
              <span className="text-[11px] font-semibold text-slate-500">아래 인스타 칸에서 아이디를 찾아 저장하세요</span>
            )}
          </div>
        </div>

        <div className={rowClass("talktalk")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rowTitle("talktalk", <MessageCircle className="h-3.5 w-3.5" />, lead.naverTalktalkUrl ? "톡톡 주소 있음" : undefined)}
            <div className="flex gap-1.5">
              {lead.naverTalktalkUrl ? (
                <>
                  <a className={`maju-button-primary min-h-11 px-3 text-xs ${primary === "talktalk" ? "text-sm" : ""}`} href={lead.naverTalktalkUrl} onClick={() => void copyMessage()} rel="noreferrer" target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                    톡톡 열기 · 문구 복사
                  </a>
                  {sentButton("talktalk")}
                </>
              ) : (
                <a className="maju-button-secondary min-h-11 px-3 text-xs" href={buildNaverMapSearchUrl(lead.businessName, lead.address)} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />
                  네이버 지도에서 찾기
                </a>
              )}
              <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => setEditing("naverTalktalkUrl")} type="button">
                {lead.naverTalktalkUrl ? "수정" : "주소 입력"}
              </button>
            </div>
          </div>
          {editing === "naverTalktalkUrl" ? renderEditor("naverTalktalkUrl") : null}
        </div>

        <div className={rowClass("email")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rowTitle("email", <Mail className="h-3.5 w-3.5" />, lead.email)}
            <div className="flex gap-1.5">
              {lead.email ? (
                <>
                  <a className={`maju-button-primary min-h-11 px-3 text-xs ${primary === "email" ? "text-sm" : ""}`} href={buildMailtoUrl(lead.email, `${lead.businessName} 대표님께 식자재 단가 안내`, message)}>
                    <Mail className="h-3.5 w-3.5" />
                    메일 쓰기
                  </a>
                  {sentButton("email")}
                </>
              ) : null}
              <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => setEditing("email")} type="button">
                {lead.email ? "수정" : "입력"}
              </button>
            </div>
          </div>
          {editing === "email" ? renderEditor("email") : null}
        </div>

        <div className={rowClass("fax")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {rowTitle("fax", <Printer className="h-3.5 w-3.5" />, lead.fax)}
            <div className="flex gap-1.5">
              {lead.fax ? (
                <>
                  <button className={`maju-button-primary min-h-11 px-3 text-xs ${primary === "fax" ? "text-sm" : ""}`} onClick={() => void copyMessage(`[팩스] ${lead.businessName} 대표님께\n\n${message}`)} type="button">
                    <Copy className="h-3.5 w-3.5" />
                    팩스 문구 복사
                  </button>
                  {sentButton("fax")}
                </>
              ) : null}
              <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => setEditing("fax")} type="button">
                {lead.fax ? "수정" : "입력"}
              </button>
            </div>
          </div>
          {editing === "fax" ? renderEditor("fax") : null}
          {lead.fax ? <p className="mt-1 text-[11px] font-semibold text-slate-500">팩스 자동 전송은 팩스 서비스 연결 후 제공됩니다. 지금은 문구를 복사해 사무실 팩스·팩스 앱으로 보내고 기록해 주세요.</p> : null}
        </div>
      </div>

      {storePhone ? <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-slate-600">전화번호 보기</summary><p className="pb-2 text-xs font-semibold text-slate-700">매장 유선 {storePhone} · 참고용(콜드콜 대상 아님)</p></details> : null}
      {notice ? <p className={`mt-2 text-[11px] font-bold ${notice.tone === "ok" ? "text-teal-700" : "text-red-700"}`}>{notice.text}</p> : null}
    </section>
  );
}
