"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Copy, ExternalLink, FileVideo, ImageIcon, Loader2, MapPin, MessageSquareText, Plus, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkifiedText } from "@/components/linkified-text";
import { MessageTemplateManager } from "@/components/message-template-manager";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { formatUploadSizeMb, MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";

type DeliveryStatus = "arrived" | "partial" | "issue";
type MessageChannel = "kakao" | "sms";
type Attachment = {
  id: string;
  attachmentType: string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  title: string;
};
type OperationNote = {
  id: string;
  createdAt: string;
  createdByName: string;
  memo: string;
  nextAction: string;
  noteType: string;
};
type LocationTag = { accuracy: number; lat: number; lng: number };
type LocationStatus = "denied" | "granted" | "idle" | "loading" | "unavailable";
type DeliverySaveProgress = { attachments: Record<string, Attachment>; key: string; noteId?: string };

const deliveryStatuses: Array<{ label: string; value: DeliveryStatus }> = [
  { label: "도착완료", value: "arrived" },
  { label: "부분배송", value: "partial" },
  { label: "이슈발생", value: "issue" }
];

const messageChannels: Array<{ label: string; value: MessageChannel }> = [
  { label: "카카오로 보내기", value: "kakao" },
  { label: "SMS", value: "sms" }
];

export function MobileDeliveryProofPanel({
  companyName,
  customerId,
  customerName,
  driverName,
  driverPhone,
  deliveryCompleteMessage,
  deliveryIssueMessage,
  deliveryPartialMessage,
  loadingPosition,
  nextCustomerId,
  notificationPhone,
  notificationSenderName
}: {
  companyName?: string;
  customerId: string;
  customerName: string;
  driverName: string;
  driverPhone?: string;
  deliveryCompleteMessage?: string;
  deliveryIssueMessage?: string;
  deliveryPartialMessage?: string;
  loadingPosition?: string;
  nextCustomerId?: string;
  notificationPhone?: string;
  notificationSenderName?: string;
}) {
  const router = useRouter();
  const [copyMessage, setCopyMessage] = useState("");
  const [contactMode, setContactMode] = useState<"company" | "driver">("company");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("arrived");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [location, setLocation] = useState<LocationTag | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [memo, setMemo] = useState("");
  const [manualRecipientPhone, setManualRecipientPhone] = useState("");
  const [messageChannel, setMessageChannel] = useState<MessageChannel>("kakao");
  const [messageResult, setMessageResult] = useState("");
  const [resolvedMessage, setResolvedMessage] = useState("");
  const [notes, setNotes] = useState<OperationNote[]>([]);
  const [saving, setSaving] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState("");
  const saveProgressRef = useRef<DeliverySaveProgress | null>(null);
  const deliveryProofAttachments = useMemo(() => attachments.filter((item) => item.attachmentType === "delivery_proof"), [attachments]);
  const deliveryNotes = useMemo(() => notes.filter((item) => item.noteType === "delivery" || item.noteType === "delivery_message"), [notes]);
  const ownerMessage = createOwnerMessage(customerName, memo, deliveryStatus, files.map((file) => file.name).join(", "), loadingPosition, {
    companyName,
    notificationPhone: contactMode === "driver" ? driverPhone : notificationPhone,
    notificationSenderName: contactMode === "driver" ? driverName : notificationSenderName,
    templates: {
      arrived: deliveryCompleteMessage,
      issue: deliveryIssueMessage,
      partial: deliveryPartialMessage
    }
  });

  function handleFileSelect(selected: File[]) {
    const oversized = selected.find((file) => file.size > MAX_UPLOAD_SIZE_BYTES);
    if (oversized) {
      setFileError(`${oversized.name} 용량이 ${formatUploadSizeMb(oversized.size)}로 최대 50MB를 초과합니다.`);
      return;
    }
    const next = [...files, ...selected].slice(0, 5);
    if (files.length + selected.length > 5) setFileError("사진은 최대 5개까지 선택할 수 있습니다.");
    else setFileError("");
    setFiles(next);
    // 2026-08-31 피드백 대응: 저장 완료 직후 다시 배송완료를 기록하려는(같은 거래처를 하루에 두 번
    // 방문하는 등) 의도적인 재입력만 버튼을 다시 눌리게 합니다 — 아래 memo onChange와 동일한 이유.
    if (status === "saved") setStatus("idle");
  }

  // 배송완료를 저장하는 순간 좌표를 한 번만(단발성) 확인합니다. watchPosition처럼 계속 추적하지 않고
  // getCurrentPosition만 쓰기 때문에 백그라운드 권한이 필요 없고, 화면을 열어둔 동안만 잠깐 동작합니다.
  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          accuracy: Math.round(position.coords.accuracy),
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationStatus("granted");
      },
      () => {
        setLocation(null);
        setLocationStatus("denied");
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    );
  }

  async function loadProofs() {
    setLoadingProofs(true);
    const response = await fetchWithTimeout(`/api/customer-operations?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }, 12000).catch(() => null);
    const payload = response?.ok ? ((await response.json().catch(() => null)) as { attachments?: Attachment[]; notes?: OperationNote[] } | null) : null;
    setAttachments(payload?.attachments || []);
    setNotes(payload?.notes || []);
    setLoadingProofs(false);
  }

  async function submit() {
    if (saving) return;

    if (!files.length) {
      setFileError("배송완료된 적재 위치와 상품 사진을 1장 이상 촬영해주세요.");
      return;
    }
    setSaving(true);
    if (messageChannel === "kakao") {
      setProgressLabel("카카오 공유 준비 중");
      const shared = await shareOwnerMessage(files);
      if (!shared) { setSaving(false); setProgressLabel(""); return; }
    }

    setProgressLabel("사진과 메모 저장 중");
    setStatus("idle");
    setMessageResult("");
    setManualRecipientPhone("");
    const locationText = location
      ? `\n위치 태그: https://www.google.com/maps?q=${location.lat},${location.lng} (정확도 약 ${location.accuracy}m)`
      : "";
    const memoText = `${ownerMessage}\n\n배송 상태: ${deliveryStatusLabel(deliveryStatus)}\n알림 방식: ${messageChannel === "kakao" ? "카카오 공유" : "SMS 자동/무료 수동"}${files.length ? `\n증빙 파일: ${files.map((file) => file.name).join(", ")}` : ""}${locationText}`;
    const attemptKey = JSON.stringify([
      customerId,
      deliveryStatus,
      messageChannel,
      memoText,
      files.map(fileKey)
    ]);
    const progress = saveProgressRef.current?.key === attemptKey ? saveProgressRef.current : { attachments: {}, key: attemptKey };

    const noteRequest = progress.noteId ? Promise.resolve(null) : fetchWithTimeout("/api/customer-operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "note",
        customerId,
        memo: memoText,
        nextAction: messageChannel === "kakao" ? "카카오 알림톡 또는 수동 공유" : "SMS 자동 발송 또는 수동 문자",
        noteType: "delivery"
      })
    }, 15000).catch(() => null);
    const pendingFiles = files.filter((file) => !progress.attachments[fileKey(file)]);
    const attachmentRequests = pendingFiles.map(async (file) => ({ file, response: await uploadDeliveryProof(customerId, file, file.name).catch(() => null) }));
    const [noteResponse, attachmentResponses] = await Promise.all([noteRequest, Promise.all(attachmentRequests)]);

    const notePayload = noteResponse?.ok ? ((await noteResponse.json().catch(() => null)) as { note?: { id?: string } } | null) : null;
    const noteId = progress.noteId || notePayload?.note?.id;
    const uploadedAttachments = { ...progress.attachments };
    const attachmentFailures: string[] = [];
    for (const item of attachmentResponses) {
      const payload = item.response?.ok ? ((await item.response.json().catch(() => null)) as { attachment?: Attachment; persisted?: boolean; uploaded?: boolean } | null) : null;
      if (payload?.attachment && payload.persisted === true && payload.uploaded === true) uploadedAttachments[fileKey(item.file)] = payload.attachment;
      else attachmentFailures.push(item.file.name);
    }
    const noteOk = Boolean(noteId);
    const attachmentOk = files.every((file) => Boolean(uploadedAttachments[fileKey(file)]));
    saveProgressRef.current = { attachments: uploadedAttachments, key: attemptKey, noteId };
    if (!noteOk || !attachmentOk) {
      // 2026-08-28 피드백 대응(배송완료 저장 실패가 성공처럼 보임/부분 실패 시 재시도하면 중복 업로드됨):
      // 메모는 성공했는데 사진 업로드만 실패한 경우, 재시도 시 메모가 또 한 번 저장되지 않도록 사진만
      // 다시 첨부하도록 안내합니다(메모 텍스트는 비우지 않되, 어떤 부분이 실패했는지 구체적으로 알립니다).
      if (noteOk && !attachmentOk) {
        setErrorDetail(
          `배송 메모는 저장됐지만 ${attachmentFailures.join(", ")} 업로드에 실패했습니다. 재시도하면 실패한 파일만 다시 저장합니다.`
        );
      } else if (!noteOk && attachmentOk) {
        setErrorDetail("사진/영상은 업로드됐지만 배송 메모 저장에 실패했습니다. 아래 재시도 버튼을 누르면 메모만 다시 저장합니다.");
      } else {
        setErrorDetail("서버에 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.");
      }
      setSaving(false);
      setProgressLabel("");
      setStatus("error");
      return;
    }

    setErrorDetail("");
    const savedAttachments = Object.values(uploadedAttachments);
    setAttachments((current) => [...savedAttachments.filter((item) => !current.some((existing) => existing.id === item.id)), ...current]);
    setProgressLabel("알림 처리 중");
    const messageResponse = await fetchWithTimeout("/api/customer-messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId: savedAttachments[0]?.id,
        channel: messageChannel,
        customerId,
        message: ownerMessage,
        noteId,
        triggerType: deliveryStatus === "issue" ? "delivery_issue" : "delivery_complete"
      })
    }, 12000).catch(() => null);
    const messagePayload = (await messageResponse?.json().catch(() => null)) as
      | { log?: { errorMessage?: string; messageBody?: string; recipientPhone?: string; status?: string }; message?: string; sent?: boolean }
      | null;
    setManualRecipientPhone(messagePayload?.log?.recipientPhone || "");
    setResolvedMessage(messagePayload?.log?.messageBody || ownerMessage);
    if (!messageResponse?.ok) {
      setMessageResult(messagePayload?.message || "거래처 알림 요청에 실패했습니다.");
      setErrorDetail("배송 메모와 증빙은 저장됐지만 거래처 알림 처리에 실패했습니다. 아래 재시도 버튼을 누르면 알림만 다시 요청합니다.");
      setSaving(false);
      setProgressLabel("");
      setStatus("error");
      return;
    }
    setMessageResult(
      messagePayload?.sent
        ? `거래처 알림 발송 완료 · ${messagePayload.log?.recipientPhone || "수신번호"}`
        : messagePayload?.log?.errorMessage || messagePayload?.message || "거래처 알림은 발송 대기 상태로 저장되었습니다."
    );
    setFiles([]);
    setMemo("");
    saveProgressRef.current = null;
    setSaving(false);
    setProgressLabel("");
    setStatus("saved");
    if (nextCustomerId) {
      router.replace(`/mobile/today?customer=${encodeURIComponent(nextCustomerId)}`);
    } else {
      router.refresh();
    }
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setStatus("idle");
  }

  async function copyOwnerMessage() {
    try {
      await navigator.clipboard.writeText(ownerMessage);
      setCopyMessage("점주 발송 문구를 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다. 문구를 직접 선택해 복사하세요.");
    }
  }

  async function shareOwnerMessage(sharedFiles: File[] = files) {
    if (!navigator.share) {
      setCopyMessage("이 브라우저는 사진과 메시지 공유를 지원하지 않습니다. 휴대폰의 Chrome 또는 Safari에서 다시 시도해주세요.");
      return false;
    }
    if (!sharedFiles.length || !navigator.canShare?.({ files: sharedFiles })) {
      setCopyMessage("선택한 사진을 함께 공유할 수 없습니다. 사진 형식이나 브라우저를 확인해주세요.");
      return false;
    }
    try {
      await navigator.clipboard?.writeText(ownerMessage).catch(() => undefined);
      const messageCard = await createMessageCardFile(customerName, ownerMessage);
      const filesWithMessage = messageCard ? [messageCard, ...sharedFiles] : sharedFiles;
      const shareData: ShareData = { text: ownerMessage, title: `${customerName} 배송 안내` };
      shareData.files = filesWithMessage;
      await navigator.share(shareData);
      setCopyMessage("사진과 메시지 카드를 공유했습니다. 문구도 클립보드에 복사해 두었습니다.");
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setCopyMessage("공유를 취소했습니다. 배송완료 처리는 아직 저장되지 않았습니다.");
        return false;
      }
      setCopyMessage("사진과 메시지를 함께 공유하지 못했습니다. 다시 시도해주세요.");
      return false;
    }
  }

  useEffect(() => {
    requestLocation();
    const savedContactMode = window.localStorage.getItem(`maju-contact-mode:${driverName}`);
    if (savedContactMode === "driver" && driverPhone) setContactMode("driver");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <section className={`mobile-card rounded-2xl border p-4 ${files.length ? "has-files" : ""}`} id="delivery-proof">
      <div className="proof-heading flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-400/15 text-amber-400">
            <Camera className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="mb-2 inline-flex rounded-full bg-amber-400/10 px-2 py-1 text-[11px] font-black text-amber-400">사진 · 메시지</span>
            <p className="truncate font-black">{customerName}</p>
            <p className="mobile-muted mt-1 text-xs font-bold">적재 위치: {loadingPosition || "점주 요청 위치"}</p>
          </div>
        </div>
        <button aria-label="배송완료 증빙 새로고침" className="mobile-card-raised grid h-11 w-11 shrink-0 place-items-center rounded-lg border" onClick={loadProofs} type="button">
          <RefreshCw className={`h-4 w-4 ${loadingProofs ? "animate-spin" : ""}`} />
        </button>
      </div>

      <label className="proof-capture mt-3 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#f6a947] px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-[#ffb75b]">
        <input
          accept="image/*"
          className="hidden"
          multiple
          onChange={(event) => {
            handleFileSelect(Array.from(event.target.files || []));
            event.target.value = "";
          }}
          type="file"
        />
        <Plus className="h-4 w-4" />
        {files.length ? `사진 추가 (${files.length}/5)` : "1. 적재 위치와 상품 사진 촬영"}
      </label>
      {files.length ? <div className="mt-3 grid grid-cols-3 gap-2">{files.map((file, index) => <div className="relative rounded-lg bg-[#111827] p-2 ring-1 ring-inset ring-slate-700" key={fileKey(file)}><ImageIcon className="h-8 w-8 text-teal-400" /><p className="mt-1 truncate text-[10px] font-bold text-slate-300">{file.name}</p><button aria-label={`${file.name} 삭제`} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white text-slate-950" onClick={() => removeFile(index)} type="button"><X className="h-3.5 w-3.5" /></button></div>)}</div> : null}
      {fileError ? <p className="mt-2 text-xs font-bold text-rose-600">{fileError}</p> : null}

      <details className="mobile-card-raised group mt-3 rounded-xl border" open={files.length > 0}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-black">
          2. 메시지 확인
          <span className="text-blue-700 group-open:hidden">열기</span>
          <span className="hidden text-blue-700 group-open:inline">닫기</span>
        </summary>
        <div className="border-t border-slate-700 p-3">
          <div className="grid grid-cols-3 gap-2">
            {deliveryStatuses.map((item) => (
              <button
                className={`min-h-12 rounded-lg border px-2 text-xs font-black transition ${
                  deliveryStatus === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700"
                }`}
                key={item.value}
                onClick={() => setDeliveryStatus(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

      <MessageTemplateManager compact mode="driver" onSelect={(body) => setMemo(body.replaceAll("{매장명}", customerName))} />
      <textarea
        className="mt-3 min-h-[92px] w-full resize-none rounded-xl border border-slate-700 bg-[#151c29] p-3 text-sm font-semibold leading-6 text-white outline-none placeholder:text-slate-500 focus:border-[#9bb4ef] focus:ring-2 focus:ring-[#9bb4ef]/20"
        onChange={(event) => {
          setMemo(event.target.value);
          // 저장 성공 직후 버튼이 잠겨 있는 상태에서, 메모를 다시 쓰기 시작하면 새로운 기록임을
          // 의미하므로 버튼을 다시 활성화합니다(아래 handleFileSelect와 동일한 이유).
          if (status === "saved") setStatus("idle");
        }}
        placeholder="점주에게 보낼 메시지를 검토하고 수정하세요."
        value={memo}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {messageChannels.map((item) => (
          <button
            className={`min-h-12 rounded-lg border px-2 text-xs font-black transition ${
              messageChannel === item.value ? "border-teal-700 bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]" : "border-slate-200 bg-white text-slate-700"
            }`}
            key={item.value}
            onClick={() => setMessageChannel(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="delivery-message-preview mt-3 rounded-lg border border-blue-100 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">점주 발송 문구</p>
          <div className="flex shrink-0 gap-1.5">
            <button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-black text-slate-700" onClick={() => void shareOwnerMessage()} type="button">
              <Send className="h-3.5 w-3.5" />
              공유
            </button>
            <button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-black text-slate-700" onClick={copyOwnerMessage} type="button">
              <Copy className="h-3.5 w-3.5" />
              복사
            </button>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">{ownerMessage}</p>
        {copyMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{copyMessage}</p> : null}
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 p-3">
        <p className="text-xs font-black text-slate-300">☎️ 문의 연락처</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className={`min-h-11 rounded-lg border px-2 text-xs font-black ${contactMode === "company" ? "border-teal-500 bg-teal-700 text-white" : "border-slate-700 text-slate-300"}`} onClick={() => { setContactMode("company"); window.localStorage.setItem(`maju-contact-mode:${driverName}`, "company"); }} type="button">회사 대표번호</button>
          <button className={`min-h-11 rounded-lg border px-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 ${contactMode === "driver" ? "border-teal-500 bg-teal-700 text-white" : "border-slate-700 text-slate-300"}`} disabled={!driverPhone} onClick={() => { setContactMode("driver"); window.localStorage.setItem(`maju-contact-mode:${driverName}`, "driver"); }} type="button">배송기사 연락처</button>
        </div>
        <p className="mt-2 text-xs font-bold text-slate-400">{contactMode === "driver" ? driverPhone || "관리자가 기사 계정에 연락처를 등록하면 자동 적용됩니다." : notificationPhone || "회사 설정에서 대표번호를 입력하세요."}</p>
      </div>
        </div>
      </details>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-blue-800">
        <MapPin className="h-3 w-3 shrink-0" />
        {locationStatus === "granted" && location
          ? `위치 준비됨 · ${location.accuracy}m`
          : locationStatus === "loading"
            ? "위치 확인 중..."
            : locationStatus === "denied"
              ? "위치 없이 저장"
              : locationStatus === "unavailable"
                ? "위치 미지원"
                : "위치 확인 대기 중"}
        {locationStatus === "denied" ? (
          <button className="-m-2 p-2 underline decoration-dotted underline-offset-2" onClick={requestLocation} type="button">
            다시 시도
          </button>
        ) : null}
      </p>

      <Button className="mt-3 h-14 w-full bg-[#FEE500] font-black text-slate-950 hover:bg-[#f5dc00]" disabled={saving || status === "saved"} onClick={submit}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "saved" ? <CheckCircle2 className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
        {saving ? progressLabel || "처리 중" : status === "saved" ? "완료 · 다음 매장으로 이동" : status === "error" ? "실패 단계 재시도" : "3. 사진 + 메시지 카카오로 공유"}
      </Button>

      {status === "error" ? (
        <p className="mt-2 text-xs font-bold text-rose-600">{errorDetail || "저장에 실패했습니다. 로그인 상태와 첨부 저장 설정을 확인해주세요."}</p>
      ) : null}
      {status === "saved" ? <p className="mt-2 text-xs font-bold text-teal-700">원장 저장 완료</p> : null}
      {messageResult ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-bold leading-5 text-blue-800 ring-1 ring-inset ring-blue-100">{messageResult}</p> : null}
      {status === "saved" && manualRecipientPhone ? (
        <a
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white text-sm font-black text-blue-800 shadow-sm"
          href={createSmsHref(manualRecipientPhone, resolvedMessage || ownerMessage)}
        >
          <MessageSquareText className="h-4 w-4" />
          무료 문자앱으로 보내기
        </a>
      ) : null}

      <details className="delivery-history mobile-card-raised group mt-4 rounded-xl border" id="delivery-history">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-black text-slate-600">
          이전 배송 기록
          <span>{deliveryProofAttachments.length + deliveryNotes.length}건</span>
        </summary>
        <div className="border-t border-blue-100 p-3">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">최근 배송완료 증빙</p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">{deliveryProofAttachments.length}건</span>
        </div>
        {loadingProofs ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-white p-3 text-sm font-bold text-slate-500">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            증빙자료를 불러오는 중입니다.
          </p>
        ) : null}
        {!loadingProofs && !deliveryProofAttachments.length ? <p className="rounded-lg bg-white p-3 text-sm font-bold text-slate-500">아직 배송완료 증빙이 없습니다.</p> : null}
        {deliveryProofAttachments.length ? (
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {deliveryProofAttachments.map((item) => (
              <a
                className="flex items-center gap-3 rounded-lg border border-blue-100 bg-white p-3 transition hover:border-blue-300"
                href={item.fileUrl || "#"}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  {item.mimeType?.startsWith("video") ? <FileVideo className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-950">{item.title}</span>
                  <span className="mt-0.5 block truncate text-xs font-bold text-slate-500">{item.createdAt}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">최근 배송 메모</p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">{deliveryNotes.length}건</span>
        </div>
        {!loadingProofs && !deliveryNotes.length ? <p className="rounded-lg bg-white p-3 text-sm font-bold text-slate-500">아직 배송 메모가 없습니다.</p> : null}
        {deliveryNotes.length ? (
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {deliveryNotes.map((item) => (
              <div className="rounded-lg border border-blue-100 bg-white p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">
                      {item.noteType === "delivery_message" ? "알림" : "배송"}
                    </span>
                    <p className="truncate text-xs font-black text-blue-700">{item.nextAction || "배송 기록"}</p>
                  </div>
                  <p className="shrink-0 text-[11px] font-bold text-slate-400">{formatHistoryDate(item.createdAt)}</p>
                </div>
                <p className="mt-2 whitespace-pre-line text-xs font-bold leading-5 text-slate-700">
                  <LinkifiedText text={item.memo} />
                </p>
                <p className="mt-2 text-[11px] font-bold text-slate-400">{item.createdByName}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
        </div>
      </details>
    </section>
  );
}

async function uploadDeliveryProof(customerId: string, file: File, title: string) {
  const formData = new FormData();
  formData.append("attachmentType", "delivery_proof");
  formData.append("customerId", customerId);
  formData.append("file", file);
  formData.append("title", title);

  return fetchWithTimeout("/api/customer-attachments/upload", {
    method: "POST",
    body: formData
  }, 120000);
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function createMessageCardFile(customerName: string, message: string) {
  try {
    const canvas = document.createElement("canvas");
    const width = 1080;
    const padding = 80;
    const lineHeight = 62;
    const lines = wrapCanvasText(message, 26);
    canvas.width = width;
    canvas.height = Math.max(560, 260 + lines.length * lineHeight);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0f766e";
    context.fillRect(0, 0, canvas.width, 24);
    context.fillStyle = "#0f172a";
    context.font = "700 46px sans-serif";
    context.fillText("배송 안내", padding, 120);
    context.fillStyle = "#475569";
    context.font = "600 30px sans-serif";
    context.fillText(customerName, padding, 174);
    context.fillStyle = "#172033";
    context.font = "600 38px sans-serif";
    lines.forEach((line, index) => context.fillText(line, padding, 270 + index * lineHeight));
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
    return blob ? new File([blob], `${customerName}-배송안내.png`, { type: "image/png" }) : null;
  } catch {
    return null;
  }
}

function wrapCanvasText(text: string, maxCharacters: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let remaining = paragraph;
    while (remaining.length > maxCharacters) {
      lines.push(remaining.slice(0, maxCharacters));
      remaining = remaining.slice(maxCharacters);
    }
    lines.push(remaining);
  }
  return lines;
}

function createOwnerMessage(
  customerName: string,
  memo: string,
  status: DeliveryStatus,
  fileName: string,
  loadingPosition?: string,
  company?: {
    companyName?: string;
    notificationPhone?: string;
    notificationSenderName?: string;
    templates?: Partial<Record<DeliveryStatus, string | undefined>>;
  }
) {
  const templateMemo = company?.templates?.[status]?.trim();
  const fallbackMemo = status === "arrived" ? `✅ ${customerName}\n배송을 마쳤습니다. 사진을 확인해 주세요.` : status === "partial" ? `📍 ${customerName}\n담당자 부재로 배송품을 지정 장소에 두었습니다. 사진을 확인해 주세요.` : `⚠️ ${customerName}\n배송 중 특이사항이 있습니다. [내용을 입력해 주세요]`;
  const baseMemo = (memo.trim() || templateMemo || fallbackMemo).replaceAll("{매장명}", customerName);
  const proofText = fileName ? `\n📷 사진 ${fileName.split(",").length}장` : "";
  const contactName = company?.notificationSenderName?.trim() || company?.companyName?.trim() || "MAJU";
  const contactPhone = company?.notificationPhone?.trim();
  const contactText = contactPhone ? `\n☎️ 문의 · ${contactName} ${contactPhone}` : `\n☎️ 문의 · ${contactName}`;

  return `${baseMemo}${proofText}${contactText}`;
}

function deliveryStatusLabel(status: DeliveryStatus) {
  if (status === "partial") return "부분배송";
  if (status === "issue") return "이슈발생";
  return "도착완료";
}

function createSmsHref(phone: string, message: string) {
  const normalizedPhone = phone.startsWith("82") ? `0${phone.slice(2)}` : phone;
  const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `sms:${normalizedPhone}${isIos ? "&" : "?"}body=${encodeURIComponent(message)}`;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
