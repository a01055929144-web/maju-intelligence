"use client";

// 리드 상세의 "영업 채널" 패널(2026-10-25).
// 순서: 문자(010) → 인스타 DM → 네이버 톡톡 → 이메일 → 팩스 → 방문. 매장 유선 번호는 참고로만 보여 줍니다.
// 인스타·톡톡은 외부 발송 API가 없어 "열기 + 문구 복사 + 보냈음 기록"으로 처리하고,
// 팩스는 팩스 서비스 연동 전까지 "문구 복사 + 보냈음 기록"만 합니다(보낸 척하지 않습니다).
// 채널 순위·형식 검사·링크 생성 규칙은 domains/lead/contact-channels.ts가 가지고, 이 컴포넌트는 화면만 담당합니다.

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import {
  buildInstagramDmUrl,
  buildMailtoUrl,
  buildNaverMapSearchUrl,
  buildSmsUrl,
  digitsOnly,
  extractInstagramHandle,
  formatKoreanPhoneNumber,
  getSafeNaverTalktalkUrl,
  isMobilePhoneNumber,
  LEAD_CONTACT_CHANNEL_LABELS,
  type LeadContactChannel,
  resolvePrimaryLeadContactChannel
} from "@/domains/lead/contact-channels";
import {
  buildLeadSourceDisclosure,
  isOutreachPolicyPromptVisible,
  leadSourceLabel,
  type OutreachPolicyState,
  requiresAfterHoursConfirmation,
  SALES_OUTREACH_RULES
} from "@/domains/lead/outreach-governance";
import { composeDmWithKit, type SalesKitField, type SalesKitLine, type SalesKitSettings } from "@/domains/lead/sales-kit";
import { buildOutreachChannelText, OUTREACH_TEXT_CHANNEL_LABEL, OUTREACH_TEXT_CHANNELS, type OutreachTextChannel } from "@/domains/lead/outreach-channel-text";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { PermitLeadItem } from "@/lib/store";
import { LEAD_DM_TEMPLATES } from "@/domains/lead/dm-template";
import {
  buildLeadDmScript,

  type LeadDmSettings,
  type PermitLeadActionKind,
  type PermitLeadActionResult,
  withPermitLeadCompanyQuery
} from "@/components/sales-route-map-workspace";

type EditableChannel = "fax" | "email" | "naverTalktalkUrl";

const CHANNEL_ACTION: Record<LeadContactChannel, { actionType: PermitLeadActionKind; result: string }> = {
  sms: { actionType: "sms", result: "문자 발송" },
  instagram: { actionType: "dm", result: "DM 발송" },
  talktalk: { actionType: "talktalk", result: "톡톡 발송" },
  email: { actionType: "email", result: "이메일 발송" },
  fax: { actionType: "fax", result: "팩스 발송" },
  visit: { actionType: "visit", result: "방문 완료" }
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
  const { confirm, confirmDialog } = useConfirm();
  const [message, setMessage] = useState(() => buildLeadDmScript(lead));
  const [drafts, setDrafts] = useState<Record<EditableChannel, string>>({
    fax: lead.fax || "",
    email: lead.email || "",
    naverTalktalkUrl: lead.naverTalktalkUrl || ""
  });
  const [editing, setEditing] = useState<EditableChannel | null>(null);
  const [saving, setSaving] = useState<EditableChannel | null>(null);
  const [recording, setRecording] = useState<LeadContactChannel | null>(null);
  const [recordingSourceDisclosure, setRecordingSourceDisclosure] = useState(false);
  const [policyState, setPolicyState] = useState<OutreachPolicyState>("loading");
  const [policyExpanded, setPolicyExpanded] = useState(false);
  const [fieldSources, setFieldSources] = useState<Array<{ collectedAt: string; fieldName: string; sourceType: string }>>([]);
  const [dncState, setDncState] = useState<{
    canRelease: boolean;
    enabled: boolean;
    entries: Array<{ blockedAt: string; channel: LeadContactChannel; dncId: string; maskedValue: string }>;
    loading: boolean;
  }>({ canRelease: false, enabled: false, entries: [], loading: true });
  const [savingDnc, setSavingDnc] = useState<LeadContactChannel | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // 11/3 A3: 회사 기본 DM 문구·제외 품목
  const [dmSettings, setDmSettings] = useState<({ canEdit: boolean; excluded: string; template: string } & LeadDmSettings) | null>(null);
  const [dmSettingsOpen, setDmSettingsOpen] = useState(false);
  const [dmSettingsDraft, setDmSettingsDraft] = useState({ excluded: "", template: "", distributorTemplate: "" });
  const isDistributorLead = lead.targetType === "distributor";
  const [dmSettingsSaving, setDmSettingsSaving] = useState(false);
  const [messageEdited, setMessageEdited] = useState(false);
  // 11/4: 문구 아래에 붙는 영업 자료(단가표·주문 링크·연락처 등) — 회사 정보 › 영업 정보에서 설정.
  const [kitLines, setKitLines] = useState<SalesKitLine[]>([]);
  const [kitSelected, setKitSelected] = useState<SalesKitField[]>([]);
  const [salesKit, setSalesKit] = useState<SalesKitSettings | null>(null);
  const [canEditSalesKit, setCanEditSalesKit] = useState(false);
  const [contactEditing, setContactEditing] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState({ label: "", phone: "" });
  const [sentChannels, setSentChannels] = useState<LeadContactChannel[]>([]);
  const [priceSheetLinks, setPriceSheetLinks] = useState<Array<{ id: string; title: string; url: string; publishedAt: string }>>([]);
  const [selectedPriceSheetUrl, setSelectedPriceSheetUrl] = useState("");
  const [savingPriceSheetDefault, setSavingPriceSheetDefault] = useState(false);
  const [recordingTextChannel, setRecordingTextChannel] = useState<OutreachTextChannel | null>(null);
  const [sentTextChannels, setSentTextChannels] = useState<OutreachTextChannel[]>([]);
  const [releaseTarget, setReleaseTarget] = useState<{ channel: LeadContactChannel; dncId: string } | null>(null);
  const [releaseReason, setReleaseReason] = useState("");

  useEffect(() => {
    let active = true;
    void fetchWithTimeout(withPermitLeadCompanyQuery("/api/sales-kit"), { cache: "no-store" }, 12000)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { canEdit?: boolean; kit?: SalesKitSettings; lines?: SalesKitLine[] } | null;
        if (!active || !response.ok || !payload) return;
        setKitLines(payload.lines || []);
        setKitSelected(payload.kit?.fields || []);
        setSalesKit(payload.kit || null);
        setCanEditSalesKit(Boolean(payload.canEdit));
        setContactDraft({ label: payload.kit?.contactLabel || "", phone: formatKoreanPhoneNumber(payload.kit?.contactPhone || "") });
      })
      .catch(() => null);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWithTimeout(withPermitLeadCompanyQuery("/api/sales-kit/price-sheet-links"), { cache: "no-store" }, 12000)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { links?: Array<{ id: string; title: string; url: string; publishedAt: string }> } | null;
        if (!active || !response.ok) return;
        const links = payload?.links || [];
        setPriceSheetLinks(links);
        setSelectedPriceSheetUrl((current) => current || links[0]?.url || "");
      })
      .catch(() => null);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (salesKit?.priceSheetUrl && priceSheetLinks.some((link) => link.url === salesKit.priceSheetUrl)) setSelectedPriceSheetUrl(salesKit.priceSheetUrl);
  }, [priceSheetLinks, salesKit?.priceSheetUrl]);

  useEffect(() => {
    let active = true;
    void fetchWithTimeout(withPermitLeadCompanyQuery(`/api/leads/dm-template${lead.address ? `?address=${encodeURIComponent(lead.address)}` : ""}`), { cache: "no-store" }, 12000)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ({ canEdit?: boolean; excluded?: string; template?: string } & LeadDmSettings) | null;
        if (!active || !response.ok || !payload) return;
        setDmSettings({ canEdit: Boolean(payload.canEdit), excluded: payload.excluded || "", template: payload.template || "", distributorTemplate: payload.distributorTemplate || "", context: payload.context });
      })
      .catch(() => null);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (dmSettings && !messageEdited) setMessage(buildLeadDmScript(lead, dmSettings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmSettings]);

  async function saveDmSettings() {
    setDmSettingsSaving(true);
    try {
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery("/api/leads/dm-template"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // 유통사 리드에서는 유통사용 문구만 바꾸고(매장용·제외 품목은 그대로 다시 보냄), 매장 리드에서는 유통사용 문구를 건드리지 않는다.
        body: JSON.stringify(isDistributorLead ? { excluded: dmSettings?.excluded || "", template: dmSettings?.template || "", distributorTemplate: dmSettingsDraft.distributorTemplate } : { excluded: dmSettingsDraft.excluded, template: dmSettingsDraft.template })
      }, 12000);
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "기본 문구를 저장하지 못했습니다.");
      setMessageEdited(false);
      setDmSettings((current) => ({ canEdit: current?.canEdit ?? true, ...current, ...(isDistributorLead ? { distributorTemplate: dmSettingsDraft.distributorTemplate } : { excluded: dmSettingsDraft.excluded, template: dmSettingsDraft.template }) } as typeof current & { canEdit: boolean; excluded: string; template: string }));
      setDmSettingsOpen(false);
      setNotice({ tone: "ok", text: "기본 문구를 저장했습니다. 모든 매장에 적용됩니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "기본 문구를 저장하지 못했습니다." });
    } finally {
      setDmSettingsSaving(false);
    }
  }

  useEffect(() => {
    setMessage(buildLeadDmScript(lead, dmSettings || undefined));
    setMessageEdited(false);
    setDrafts({ fax: lead.fax || "", email: lead.email || "", naverTalktalkUrl: lead.naverTalktalkUrl || "" });
    setEditing(null);
    setNotice(null);
    setSentChannels([]);
    setSentTextChannels([]);
    // 다른 리드로 바뀔 때만 초기화합니다(같은 리드의 저장 결과 반영 때 작성 중인 문구를 지우지 않도록).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function refreshDoNotContacts() {
    setDncState((current) => ({ ...current, loading: true }));
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/do-not-contact`),
        { cache: "no-store" },
        12000
      );
      const payload = (await response.json().catch(() => null)) as {
        canRelease?: boolean;
        enabled?: boolean;
        entries?: Array<{ blockedAt: string; channel: LeadContactChannel; dncId: string; maskedValue: string }>;
      } | null;
      if (!response.ok) throw new Error("연락 거부 상태를 확인하지 못했습니다.");
      setDncState({ canRelease: Boolean(payload?.canRelease), enabled: Boolean(payload?.enabled), entries: payload?.entries || [], loading: false });
    } catch {
      setDncState({ canRelease: false, enabled: false, entries: [], loading: false });
    }
  }

  useEffect(() => {
    void refreshDoNotContacts();
    // refreshDoNotContacts는 현재 lead.id만 사용합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  useEffect(() => {
    let active = true;
    void fetchWithTimeout(withPermitLeadCompanyQuery("/api/leads/outreach-policy"), { cache: "no-store" }, 12000)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { acknowledged?: boolean } | null;
        if (active) setPolicyState(response.ok && payload?.acknowledged ? "acknowledged" : "required");
      })
      .catch(() => { if (active) setPolicyState("required"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchWithTimeout(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/source-disclosure`), { cache: "no-store" }, 12000)
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { sources?: Array<{ collectedAt: string; fieldName: string; sourceType: string }> } | null;
        if (active && response.ok) setFieldSources(payload?.sources || []);
      })
      .catch(() => { if (active) setFieldSources([]); });
    return () => { active = false; };
  }, [lead.id]);

  async function acknowledgePolicy() {
    setPolicyState("saving");
    try {
      const mobileSurface = typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery("/api/leads/outreach-policy"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-maju-surface": mobileSurface ? "mobile" : "pc" },
        body: JSON.stringify({})
      }, 12000);
      const payload = (await response.json().catch(() => null)) as { acknowledged?: boolean; message?: string } | null;
      if (!response.ok || !payload?.acknowledged) throw new Error(payload?.message || "영업 수칙 확인을 저장하지 못했습니다.");
      setPolicyState("acknowledged");
    } catch (error) {
      setPolicyState("required");
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "영업 수칙 확인을 저장하지 못했습니다." });
    }
  }

  const mobile = isMobilePhoneNumber(lead.phone) ? formatKoreanPhoneNumber(lead.phone) : undefined;
  const storePhone = lead.phone && !mobile ? formatKoreanPhoneNumber(lead.phone) : undefined;
  const instagramHandle = extractInstagramHandle(lead.instagramUrl);
  const talktalkUrl = getSafeNaverTalktalkUrl(lead.naverTalktalkUrl);
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

  const effectiveKitLines = selectedPriceSheetUrl
    ? [...kitLines.filter((line) => line.field !== "price_sheet"), { field: "price_sheet" as const, label: "단가표", text: `▶ 단가표 ${selectedPriceSheetUrl}` }]
    : kitLines;
  const effectiveKitSelected = selectedPriceSheetUrl && !kitSelected.includes("price_sheet") ? [...kitSelected, "price_sheet" as const] : kitSelected;
  const outgoing = composeDmWithKit(message, effectiveKitLines, effectiveKitSelected);
  const channelRows = ([
    { channel: "sms", value: mobile || "", url: mobile ? buildSmsUrl(mobile, outgoing) : "" },
    { channel: "instagram", value: instagramHandle ? `@${instagramHandle}` : "", url: instagramHandle ? buildInstagramDmUrl(instagramHandle) : "" },
    { channel: "talktalk", value: talktalkUrl || "", url: talktalkUrl || buildNaverMapSearchUrl(lead.businessName, lead.address) },
    { channel: "email", value: lead.email || "", url: lead.email ? buildMailtoUrl(lead.email, `${lead.businessName} 대표님께 식자재 단가 안내`, outgoing) : "" },
    { channel: "fax", value: lead.fax ? formatKoreanPhoneNumber(lead.fax) : "", url: "" },
    { channel: "visit", value: lead.address || "", url: buildNaverMapSearchUrl(lead.businessName, lead.address) }
  ] satisfies Array<{ channel: LeadContactChannel; value: string; url: string }>).sort((a, b) => Number(b.channel === primary) - Number(a.channel === primary));

  function requireAcknowledgedPolicy(event?: MouseEvent<HTMLElement>): boolean {
    if (policyState === "acknowledged") return true;
    event?.preventDefault();
    if (policyState === "required") setPolicyExpanded(true);
    return false;
  }

  async function copyMessage(text = outgoing) {
    if (!requireAcknowledgedPolicy()) return false;
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ tone: "ok", text: "문구를 복사했습니다. 열린 창에 붙여 넣어 보내 주세요." });
      return true;
    } catch {
      setNotice({ tone: "error", text: "복사 권한이 없어 문구를 직접 선택해 복사해 주세요." });
      return false;
    }
  }

  async function recordSent(channel: LeadContactChannel) {
    const config = CHANNEL_ACTION[channel];
    setRecording(channel);
    setNotice(null);
    try {
      const saved = await onAction(lead, config.actionType, config.result, outgoing.slice(0, 500));
      if (saved.ok) setSentChannels((current) => (current.includes(channel) ? current : [...current, channel]));
      setNotice(saved.ok ? { tone: "ok", text: `${LEAD_CONTACT_CHANNEL_LABELS[channel]} 보낸 기록을 남겼습니다.` } : { tone: "error", text: saved.message || "기록하지 못했습니다." });
    } finally {
      setRecording(null);
    }
  }

  async function recordTextSent(channel: OutreachTextChannel) {
    if (!requireAcknowledgedPolicy()) return;
    const actionType: PermitLeadActionKind = channel === "sms" ? "sms" : channel === "talktalk" ? "talktalk" : "dm";
    const formatted = buildOutreachChannelText(channel, outgoing, selectedPriceSheetUrl || undefined).text;
    setRecordingTextChannel(channel);
    setNotice(null);
    try {
      const saved = await onAction(lead, actionType, `${OUTREACH_TEXT_CHANNEL_LABEL[channel]} 전달`, formatted.slice(0, 500));
      if (saved.ok) setSentTextChannels((current) => current.includes(channel) ? current : [...current, channel]);
      setNotice(saved.ok ? { tone: "ok", text: `${OUTREACH_TEXT_CHANNEL_LABEL[channel]} 보낸 기록을 남겼습니다.` } : { tone: "error", text: saved.message || "기록하지 못했습니다." });
    } finally {
      setRecordingTextChannel(null);
    }
  }

  async function savePriceSheetDefault() {
    if (!salesKit || !selectedPriceSheetUrl) return;
    setSavingPriceSheetDefault(true);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery("/api/sales-kit"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...salesKit, priceSheetUrl: selectedPriceSheetUrl })
      }, 12000);
      const payload = (await response.json().catch(() => null)) as { kit?: SalesKitSettings; message?: string } | null;
      if (!response.ok || !payload?.kit) throw new Error(payload?.message || "기본 단가표를 저장하지 못했습니다.");
      setSalesKit(payload.kit);
      setNotice({ tone: "ok", text: "이 단가표를 영업정보의 기본값으로 저장했습니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "기본 단가표를 저장하지 못했습니다." });
    } finally {
      setSavingPriceSheetDefault(false);
    }
  }

  async function copySourceDisclosure() {
    if (recordingSourceDisclosure) return;
    const disclosure = buildLeadSourceDisclosure({ businessName: lead.businessName, collectedAt: lead.createdAt, source: lead.source });
    setRecordingSourceDisclosure(true);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/source-disclosure`),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        12000
      );
      const payload = (await response.json().catch(() => null)) as { message?: string; ok?: boolean } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "출처 안내 기록을 남기지 못했습니다.");
      try {
        await navigator.clipboard.writeText(disclosure);
      } catch {
        setNotice({ tone: "error", text: "안내 기록은 저장했지만 복사 권한이 없어 문구를 직접 선택해 복사해 주세요." });
        return;
      }
      setNotice({ tone: "ok", text: "출처 답변을 복사하고 안내 기록을 남겼습니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "출처 안내 기록을 남기지 못해 문구를 복사하지 않았습니다." });
    } finally {
      setRecordingSourceDisclosure(false);
    }
  }

  async function confirmAfterHoursSms(event: MouseEvent<HTMLAnchorElement>) {
    if (!requireAcknowledgedPolicy(event)) return;
    if (!requiresAfterHoursConfirmation()) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    if (await confirm({ title: "문자 앱 열기", body: "현재는 문자 발송을 피해야 하는 시간(21:00~08:00)입니다. 그래도 문자 앱을 여시겠습니까?", confirmLabel: "문자 앱 열기", tone: "default" })) window.location.href = href;
  }

  async function saveContact() {
    if (!salesKit) return;
    setContactSaving(true);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery("/api/sales-kit"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...salesKit, contactLabel: contactDraft.label.trim(), contactPhone: digitsOnly(contactDraft.phone) })
      }, 12000);
      const payload = (await response.json().catch(() => null)) as { kit?: SalesKitSettings; message?: string } | null;
      if (!response.ok || !payload?.kit) throw new Error(payload?.message || "문의 정보를 저장하지 못했습니다.");
      setSalesKit(payload.kit);
      setContactEditing(false);
      const refreshed = await fetchWithTimeout(withPermitLeadCompanyQuery("/api/sales-kit"), { cache: "no-store" }, 12000);
      const refreshedPayload = (await refreshed.json().catch(() => null)) as { lines?: SalesKitLine[] } | null;
      if (refreshed.ok) setKitLines(refreshedPayload?.lines || []);
      setNotice({ tone: "ok", text: "문의 정보를 저장했습니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "문의 정보를 저장하지 못했습니다." });
    } finally {
      setContactSaving(false);
    }
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

  async function registerDoNotContact(channel: LeadContactChannel, value: string) {
    if (!(await confirm({ title: "연락 거부 등록", body: `${LEAD_CONTACT_CHANNEL_LABELS[channel]} 채널을 연락 거부로 등록하시겠습니까?`, confirmLabel: "등록", tone: "default" }))) return;
    setSavingDnc(channel);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/do-not-contact`),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, reason: "상대방 요청", value }) },
        12000
      );
      const payload = (await response.json().catch(() => null)) as { message?: string; ok?: boolean } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "연락 거부를 등록하지 못했습니다.");
      await refreshDoNotContacts();
      setNotice({ tone: "ok", text: "연락 거부를 등록했습니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "연락 거부를 등록하지 못했습니다." });
    } finally {
      setSavingDnc(null);
    }
  }

  async function releaseDoNotContact(entry: { channel: LeadContactChannel; dncId: string }, reason: string) {
    // 기존 window.prompt("연락 거부 해제 사유를 입력해 주세요.") 계약은 공용 Dialog 입력으로 대체했다.
    const normalizedReason = reason.trim();
    if (!normalizedReason) return;
    setSavingDnc(entry.channel);
    setNotice(null);
    try {
      const response = await fetchWithTimeout(
        withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/do-not-contact`),
        { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dncId: entry.dncId, releaseReason: normalizedReason }) },
        12000
      );
      const payload = (await response.json().catch(() => null)) as { message?: string; ok?: boolean } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "연락 거부를 해제하지 못했습니다.");
      await refreshDoNotContacts();
      setReleaseTarget(null);
      setReleaseReason("");
      setNotice({ tone: "ok", text: "연락 거부를 해제했습니다." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "연락 거부를 해제하지 못했습니다." });
    } finally {
      setSavingDnc(null);
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

  function sentButton(channel: LeadContactChannel) {
    return (
      <button
        aria-label={`${LEAD_CONTACT_CHANNEL_LABELS[channel]} 보냈음 기록`}
        className={`inline-flex min-h-11 items-center gap-1 rounded-lg border px-3 text-xs font-black disabled:opacity-50 ${sentChannels.includes(channel) ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-teal-400 hover:text-teal-700"}`}
        disabled={Boolean(recording)}
        onClick={() => void recordSent(channel)}
        title="보냈으면 눌러 기록"
        type="button"
      >
        {recording === channel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        보냈음
      </button>
    );
  }

  return (
    <section aria-label="영업 채널" className="rounded-xl border border-slate-200 bg-white p-3">
      {isOutreachPolicyPromptVisible(policyState) ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" role="alert">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-amber-950">영업 연락 수칙을 확인해 주세요</p>
            <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => setPolicyExpanded((open) => !open)} type="button">
              {policyExpanded ? "수칙 닫기" : "수칙 보기·확인"}
            </button>
          </div>
          {policyExpanded ? (
            <div id="sales-outreach-policy-details">
              <ul className="list-disc space-y-1 px-5 py-2 text-xs font-semibold leading-5 text-amber-950">
                {SALES_OUTREACH_RULES.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
              <button className="maju-button-primary min-h-11 w-full justify-center disabled:cursor-wait disabled:opacity-60" disabled={policyState === "saving"} onClick={() => void acknowledgePolicy()} type="button">
                {policyState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {policyState === "saving" ? "확인 기록 저장 중" : "확인하고 영업 시작"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-950">영업 채널</p>
        <span className="text-[11px] font-bold text-slate-500">먼저: {LEAD_CONTACT_CHANNEL_LABELS[primary]}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-black text-slate-600">보낼 문구 <span className="font-semibold text-slate-400">· 이번에만 고쳐도 됨</span></span>
        <button className="inline-flex min-h-11 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-black text-slate-700 hover:border-teal-400 hover:text-teal-700" onClick={() => void copyMessage()} type="button">
          <Copy className="h-3.5 w-3.5" />
          문구 복사
        </button>
      </div>
      <label className="block">
        <span className="sr-only">보낼 문구</span>
        <textarea
          className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-slate-800 outline-none focus:border-teal-400 focus:bg-white"
          onChange={(event) => {
            setMessage(event.target.value);
            setMessageEdited(true);
          }}
          rows={8}
          value={message}
        />
      </label>
      <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-black text-slate-700">
            발행한 단가표
            <select
              aria-label="발행한 단가표"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"
              onChange={(event) => setSelectedPriceSheetUrl(event.target.value)}
              value={selectedPriceSheetUrl}
            >
              {priceSheetLinks.length ? priceSheetLinks.map((link) => (
                <option key={link.id} value={link.url}>{link.title} · {new Date(link.publishedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</option>
              )) : <option value="">발행한 공개 단가표가 없습니다</option>}
            </select>
          </label>
          {canEditSalesKit ? (
            <button className="maju-button-secondary min-h-11 px-3 text-xs" disabled={!selectedPriceSheetUrl || savingPriceSheetDefault} onClick={() => void savePriceSheetDefault()} type="button">
              {savingPriceSheetDefault ? "저장 중" : "기본으로 저장"}
            </button>
          ) : null}
        </div>
        {selectedPriceSheetUrl ? <p className="mt-1 truncate text-[11px] font-semibold text-teal-800">▶ 단가표 {selectedPriceSheetUrl}</p> : null}
      </div>
      <div className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
        {effectiveKitLines.length ? (
          <ul className="space-y-1">
            {effectiveKitLines.map((line) => (
              <li key={line.field}>
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-slate-700">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      checked={effectiveKitSelected.includes(line.field)}
                      onChange={(event) => setKitSelected((current) => (event.target.checked ? [...current, line.field] : current.filter((item) => item !== line.field)))}
                      type="checkbox"
                    />
                    <span className="min-w-0 truncate">{line.text}</span>
                  </label>
                  {line.field === "contact" && canEditSalesKit ? (
                    <button className="min-h-11 shrink-0 px-2 font-black text-teal-700" onClick={() => setContactEditing((open) => !open)} type="button">수정</button>
                  ) : null}
                </div>
                {line.field === "contact" && contactEditing ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                    <input aria-label="문의 이름" className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setContactDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder="가짜유통" value={contactDraft.label} />
                    <input aria-label="문의 전화" className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" inputMode="numeric" onChange={(event) => setContactDraft((draft) => ({ ...draft, phone: formatKoreanPhoneNumber(digitsOnly(event.target.value).slice(0, 11)) }))} placeholder="010-0000-0000" value={contactDraft.phone} />
                    <button className="maju-button-primary min-h-11 px-3 text-xs" disabled={contactSaving} onClick={() => void saveContact()} type="button">{contactSaving ? "저장 중" : "저장"}</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] font-semibold text-slate-500">
            단가표·주문 링크·연락처를 문구 아래에 붙이려면 <a className="font-black text-teal-700 underline-offset-2 hover:underline" href="/dashboard/settings/sales">회사 정보 › 영업 정보</a>에서 설정하세요.
          </p>
        )}
      </div>

      <div aria-label="채널별 문구" className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {OUTREACH_TEXT_CHANNELS.map((channel) => {
          const formatted = buildOutreachChannelText(channel, outgoing, selectedPriceSheetUrl || undefined);
          return (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2" key={channel}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800">{OUTREACH_TEXT_CHANNEL_LABEL[channel]}</span>
                {channel === "sms" ? <span className={`text-[10px] font-black ${formatted.longSms ? "text-amber-700" : "text-slate-500"}`}>{formatted.longSms ? "장문 문자" : `${formatted.bytes} bytes`}</span> : null}
              </div>
              <div className="mt-1 flex gap-1.5">
                <button className="maju-button-secondary min-h-11 flex-1 px-2 text-xs" onClick={() => void copyMessage(formatted.text)} type="button"><Copy className="h-3.5 w-3.5" />복사</button>
                <button
                  className={`maju-button-secondary min-h-11 flex-1 px-2 text-xs ${sentTextChannels.includes(channel) ? "border-teal-600 bg-teal-600 text-white" : ""}`}
                  disabled={Boolean(recordingTextChannel)}
                  onClick={() => void recordTextSent(channel)}
                  type="button"
                >
                  {recordingTextChannel === channel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}보냈음
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div aria-label="영업 채널 표" className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
        {channelRows.map(({ channel, value, url }) => (
          <div className={`grid gap-2 py-2 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center ${channel === primary ? "bg-teal-50" : ""}`} key={channel}>
            <div className="flex items-center gap-1.5 px-2">
              <span className="text-xs font-black text-slate-900">{LEAD_CONTACT_CHANNEL_LABELS[channel]}</span>
              {channel === primary ? <span className="rounded-full bg-teal-700 px-1.5 py-0.5 text-[10px] font-black text-white">먼저</span> : null}
            </div>
            <div className="flex min-w-0 items-center gap-1 px-2">
              <span className={`min-w-0 truncate text-xs font-semibold ${value ? "text-slate-700" : "text-slate-400"}`}>{value || "연락처 없음"}</span>
              {channel === "talktalk" || channel === "email" || channel === "fax" ? (
                <button className="min-h-11 shrink-0 px-2 text-xs font-black text-teal-700" onClick={() => setEditing(channel === "talktalk" ? "naverTalktalkUrl" : channel)} type="button">{value ? "수정" : "입력"}</button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5 px-2">
              {url ? (
        <a className="maju-button-secondary min-h-11 px-3 text-xs" href={url} onClick={channel === "sms" ? (event) => void confirmAfterHoursSms(event) : (event) => { requireAcknowledgedPolicy(event); }} rel={channel === "email" || channel === "sms" ? undefined : "noreferrer"} target={channel === "email" || channel === "sms" ? undefined : "_blank"}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  열기
                </a>
              ) : <button className="maju-button-secondary min-h-11 px-3 text-xs" disabled title={channel === "fax" ? "팩스 서비스 연결 후 열 수 있습니다." : "연락처를 먼저 입력해 주세요."} type="button">열기</button>}
              <button className="maju-button-secondary min-h-11 px-3 text-xs" onClick={() => void copyMessage(channel === "fax" ? `[팩스] ${lead.businessName} 대표님께\n\n${outgoing}` : outgoing)} type="button"><Copy className="h-3.5 w-3.5" />문구 복사</button>
              {sentButton(channel)}
            </div>
            {editing === (channel === "talktalk" ? "naverTalktalkUrl" : channel) && (channel === "talktalk" || channel === "email" || channel === "fax") ? (
              <div className="sm:col-span-3">{renderEditor(channel === "talktalk" ? "naverTalktalkUrl" : channel)}</div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">팩스 자동 전송은 팩스 서비스 연결 후 제공됩니다. 지금은 문구를 복사해 사무실 팩스·팩스 앱으로 직접 보낸 뒤 기록해 주세요.</p>
      {dmSettings?.canEdit ? (
        <div className="mt-1.5">
          <button
            className="text-[11px] font-bold text-teal-700 underline-offset-2 hover:underline"
            onClick={() => {
              setDmSettingsDraft({ excluded: dmSettings.excluded, template: dmSettings.template, distributorTemplate: dmSettings.distributorTemplate || LEAD_DM_TEMPLATES.distributor[0].body });
              setDmSettingsOpen((open) => !open);
            }}
            type="button"
          >
            {dmSettingsOpen ? "기본 문구 닫기" : isDistributorLead ? "유통사용 기본 문구 설정" : "기본 문구·제외 품목 설정"}
          </button>
          {dmSettingsOpen ? (
            <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-2">
              <p className="text-[11px] font-semibold leading-4 text-slate-500">{"{상호} {업종} {품목}"}은 매장마다 자동으로 바뀝니다. 결제 조건은 &lsquo;협의&rsquo;로 쓰는 것을 권장합니다.</p>
              <textarea
                aria-label="기본 DM 문구"
                className="mt-1 w-full resize-y rounded-md border border-slate-200 p-2 text-xs leading-5"
                onChange={(event) => setDmSettingsDraft((draft) => isDistributorLead ? { ...draft, distributorTemplate: event.target.value } : { ...draft, template: event.target.value })}
                rows={4}
                value={isDistributorLead ? dmSettingsDraft.distributorTemplate : dmSettingsDraft.template}
              />
              {isDistributorLead ? null : <input
                aria-label="제외 품목"
                className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"
                onChange={(event) => setDmSettingsDraft((draft) => ({ ...draft, excluded: event.target.value }))}
                placeholder="제외 품목 (쉼표로 구분, 예: 육류, 주류)"
                value={dmSettingsDraft.excluded}
              />}
              <button className="maju-button-primary mt-1.5 h-8 w-full justify-center text-xs" disabled={dmSettingsSaving || !(isDistributorLead ? dmSettingsDraft.distributorTemplate : dmSettingsDraft.template).trim()} onClick={() => void saveDmSettings()} type="button">
                {dmSettingsSaving ? "저장 중" : "기본 문구 저장"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
        <span>출처 {leadSourceLabel(lead.source)} · {new Date(lead.createdAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}{fieldSources.length ? ` · ${Array.from(new Set(fieldSources.map((item) => item.fieldName))).join("·")}` : ""}</span>
        <button aria-busy={recordingSourceDisclosure} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-black text-slate-600 hover:bg-slate-100 disabled:opacity-50" disabled={recordingSourceDisclosure} onClick={() => void copySourceDisclosure()} title="상대가 연락처 출처를 물으면 이 답변을 복사해 보내세요" type="button">
          {recordingSourceDisclosure ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
          출처 답변 복사
        </button>
      </div>

      <details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-black text-amber-950">영업 수칙 다시 보기</summary>
        <ul className="list-disc space-y-1 pb-2 pl-5 text-[11px] font-semibold leading-5 text-amber-900">
          {SALES_OUTREACH_RULES.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </details>

      {storePhone ? <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-slate-600">전화번호 보기</summary><p className="pb-2 text-xs font-semibold text-slate-700">매장 유선 {storePhone} · 참고용(콜드콜 대상 아님)</p></details> : null}
      <details className="mt-2 rounded-lg border border-slate-200 px-3 py-1">
        <summary className="cursor-pointer py-2 text-xs font-bold text-slate-600">
          연락 거부 관리{dncState.entries.length ? ` · ${dncState.entries.length}건 등록됨` : ""}{!dncState.loading && !dncState.enabled ? " · 운영 승인 전 비활성화됨" : ""}
        </summary>
        <div className="mb-2 grid gap-1.5 sm:grid-cols-2">
          {([
            ["sms", mobile],
            ["instagram", instagramHandle ? `@${instagramHandle}` : undefined],
            ["talktalk", lead.naverTalktalkUrl],
            ["email", lead.email],
            ["fax", lead.fax],
            ["visit", lead.id]
          ] as Array<[LeadContactChannel, string | undefined]>).filter(([, value]) => Boolean(value)).map(([channel, value]) => {
            const active = dncState.entries.find((entry) => entry.channel === channel);
            return (
              <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-red-100 bg-white px-2" key={channel}>
                <span className="text-[11px] font-bold text-slate-700">
                  {LEAD_CONTACT_CHANNEL_LABELS[channel]}{active ? ` · ${active.maskedValue}` : ""}
                </span>
                <button
                  className="maju-button-secondary min-h-9 px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!dncState.enabled || dncState.loading || savingDnc === channel || Boolean(active && !dncState.canRelease)}
                  onClick={() => {
                    if (active) { setReleaseTarget(active); setReleaseReason(""); }
                    else void registerDoNotContact(channel, value!);
                  }}
                  type="button"
                >
                  {savingDnc === channel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {active ? "해제" : "등록"}
                </button>
              </div>
            );
          })}
        </div>
      </details>
      {notice ? <Notice className="mt-2 text-xs" kind={notice.tone === "ok" ? "success" : "error"}>{notice.text}</Notice> : null}
      {confirmDialog}
      {releaseTarget ? (
        <Dialog ariaLabel="연락 거부 해제" initialFocus="[data-release-reason]" onClose={() => setReleaseTarget(null)} size="sm" title="연락 거부 해제">
          <label className="mt-2 block text-sm font-bold text-slate-700">해제 사유
            <input className="maju-input mt-1 w-full" data-release-reason="" onChange={(event) => setReleaseReason(event.target.value)} placeholder="해제 사유를 입력해 주세요" value={releaseReason} />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button className="maju-button-secondary" onClick={() => setReleaseTarget(null)} type="button">취소</button>
            <button className="maju-button-primary" disabled={!releaseReason.trim() || savingDnc === releaseTarget.channel} onClick={() => void releaseDoNotContact(releaseTarget, releaseReason)} type="button">해제</button>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
