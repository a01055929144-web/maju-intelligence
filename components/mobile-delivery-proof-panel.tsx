"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Copy, ExternalLink, FileVideo, ImageIcon, Loader2, MapPin, MessageSquareText, Plus, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkifiedText } from "@/components/linkified-text";
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

const deliveryStatuses: Array<{ label: string; value: DeliveryStatus }> = [
  { label: "도착완료", value: "arrived" },
  { label: "부분배송", value: "partial" },
  { label: "이슈발생", value: "issue" }
];

const messageChannels: Array<{ label: string; value: MessageChannel }> = [
  { label: "SMS 자동", value: "sms" },
  { label: "카카오 대기", value: "kakao" }
];

export function MobileDeliveryProofPanel({
  companyName,
  customerId,
  customerName,
  deliveryCompleteMessage,
  deliveryIssueMessage,
  deliveryPartialMessage,
  loadingPosition,
  notificationPhone,
  notificationSenderName
}: {
  companyName?: string;
  customerId: string;
  customerName: string;
  deliveryCompleteMessage?: string;
  deliveryIssueMessage?: string;
  deliveryPartialMessage?: string;
  loadingPosition?: string;
  notificationPhone?: string;
  notificationSenderName?: string;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("arrived");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [location, setLocation] = useState<LocationTag | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [memo, setMemo] = useState("");
  const [manualRecipientPhone, setManualRecipientPhone] = useState("");
  const [messageChannel, setMessageChannel] = useState<MessageChannel>("sms");
  const [messageResult, setMessageResult] = useState("");
  const [notes, setNotes] = useState<OperationNote[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorDetail, setErrorDetail] = useState("");
  const deliveryProofAttachments = useMemo(() => attachments.filter((item) => item.attachmentType === "delivery_proof"), [attachments]);
  const deliveryNotes = useMemo(() => notes.filter((item) => item.noteType === "delivery" || item.noteType === "delivery_message"), [notes]);
  const ownerMessage = createOwnerMessage(customerName, memo, deliveryStatus, file?.name || "", loadingPosition, {
    companyName,
    notificationPhone,
    notificationSenderName,
    templates: {
      arrived: deliveryCompleteMessage,
      issue: deliveryIssueMessage,
      partial: deliveryPartialMessage
    }
  });

  function handleFileSelect(selected: File | null) {
    if (selected && selected.size > MAX_UPLOAD_SIZE_BYTES) {
      setFile(null);
      setFileError(`파일 용량이 ${formatUploadSizeMb(selected.size)}로 최대 50MB를 초과합니다. 영상 길이를 줄이거나 화질을 낮춰 다시 선택해주세요.`);
      return;
    }
    setFileError("");
    setFile(selected);
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
    const response = await fetch(`/api/customer-operations?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? ((await response.json().catch(() => null)) as { attachments?: Attachment[]; notes?: OperationNote[] } | null) : null;
    setAttachments(payload?.attachments || []);
    setNotes(payload?.notes || []);
    setLoadingProofs(false);
  }

  async function submit() {
    if (saving) return;

    setSaving(true);
    setStatus("idle");
    setMessageResult("");
    setManualRecipientPhone("");
    const locationText = location
      ? `\n위치 태그: https://www.google.com/maps?q=${location.lat},${location.lng} (정확도 약 ${location.accuracy}m)`
      : "";
    const memoText = `${ownerMessage}\n\n배송 상태: ${deliveryStatusLabel(deliveryStatus)}\n알림 방식: ${messageChannel === "kakao" ? "카카오 수동/알림톡 대기" : "SMS 자동/무료 수동"}${file?.name ? `\n증빙 파일: ${file.name}` : ""}${locationText}`;

    const noteRequest = fetch("/api/customer-operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "note",
        customerId,
        memo: memoText,
        nextAction: messageChannel === "kakao" ? "카카오 알림톡 또는 수동 공유" : "SMS 자동 발송 또는 수동 문자",
        noteType: "delivery"
      })
    });
    const attachmentRequest = file ? uploadDeliveryProof(customerId, file, file.name) : Promise.resolve(new Response(null, { status: 200 }));
    const [noteResponse, attachmentResponse] = await Promise.all([noteRequest, attachmentRequest]).catch(() => [null, null]);

    setSaving(false);

    const noteOk = Boolean(noteResponse?.ok);
    const attachmentOk = Boolean(attachmentResponse?.ok);
    if (!noteOk || !attachmentOk) {
      // 2026-08-28 피드백 대응(배송완료 저장 실패가 성공처럼 보임/부분 실패 시 재시도하면 중복 업로드됨):
      // 메모는 성공했는데 사진 업로드만 실패한 경우, 재시도 시 메모가 또 한 번 저장되지 않도록 사진만
      // 다시 첨부하도록 안내합니다(메모 텍스트는 비우지 않되, 어떤 부분이 실패했는지 구체적으로 알립니다).
      if (noteOk && !attachmentOk) {
        setErrorDetail("배송 메모는 저장됐지만 사진/영상 업로드에 실패했습니다. 파일을 다시 선택한 뒤 저장을 다시 눌러주세요(메모는 중복 저장되지 않습니다).");
      } else if (!noteOk && attachmentOk) {
        setErrorDetail("사진/영상은 업로드됐지만 배송 메모 저장에 실패했습니다. 저장을 다시 눌러 메모를 다시 저장해주세요.");
      } else {
        setErrorDetail("서버에 저장하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.");
      }
      setStatus("error");
      return;
    }

    setErrorDetail("");
    const notePayload = noteResponse?.ok ? ((await noteResponse.json().catch(() => null)) as { note?: { id?: string } } | null) : null;
    const attachmentPayload = attachmentResponse?.ok ? ((await attachmentResponse.json().catch(() => null)) as { attachment?: { id?: string } } | null) : null;
    const messageResponse = await fetch("/api/customer-messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attachmentId: attachmentPayload?.attachment?.id,
        channel: messageChannel,
        customerId,
        message: ownerMessage,
        noteId: notePayload?.note?.id,
        triggerType: deliveryStatus === "issue" ? "delivery_issue" : "delivery_complete"
      })
    }).catch(() => null);
    const messagePayload = (await messageResponse?.json().catch(() => null)) as
      | { log?: { errorMessage?: string; recipientPhone?: string; status?: string }; message?: string; sent?: boolean }
      | null;
    setManualRecipientPhone(messagePayload?.log?.recipientPhone || "");
    setMessageResult(
      messagePayload?.sent
        ? `거래처 알림 발송 완료 · ${messagePayload.log?.recipientPhone || "수신번호"}`
        : messagePayload?.log?.errorMessage || messagePayload?.message || "거래처 알림은 발송 대기 상태로 저장되었습니다."
    );
    setFile(null);
    setMemo("");
    setStatus("saved");
    await loadProofs();
  }

  async function copyOwnerMessage() {
    try {
      await navigator.clipboard.writeText(ownerMessage);
      setCopyMessage("점주 발송 문구를 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다. 문구를 직접 선택해 복사하세요.");
    }
  }

  async function shareOwnerMessage() {
    if (!navigator.share) {
      await copyOwnerMessage();
      return;
    }
    try {
      await navigator.share({ text: ownerMessage, title: `${customerName} 배송 안내` });
      setCopyMessage("공유 화면을 열었습니다.");
    } catch {
      setCopyMessage("공유를 취소했거나 지원되지 않아 문구를 복사해 사용하세요.");
    }
  }

  useEffect(() => {
    loadProofs();
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4" id="delivery-proof">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-700 text-white">
            <Camera className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="mb-2 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-black text-blue-800 ring-1 ring-inset ring-blue-100">2. 배송완료 저장</span>
            <p className="font-black text-slate-950">배송완료 기록</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{customerName} 도착 사진과 점주 발송 문구를 저장합니다.</p>
          </div>
        </div>
        <button aria-label="배송완료 증빙 새로고침" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-blue-200 bg-white text-blue-700" onClick={loadProofs} type="button">
          <RefreshCw className={`h-4 w-4 ${loadingProofs ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {deliveryStatuses.map((item) => (
          <button
            className={`h-11 rounded-lg border px-2 text-xs font-black transition ${
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

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-white px-4 py-4 text-sm font-black text-blue-800 transition hover:bg-blue-50">
        <input
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => handleFileSelect(event.target.files?.[0] || null)}
          type="file"
        />
        <Plus className="h-4 w-4" />
        {file ? file.name : "도착 사진/영상 선택"}
      </label>
      {fileError ? <p className="mt-2 text-xs font-bold text-rose-600">{fileError}</p> : null}

      <textarea
        className="mt-3 min-h-[92px] resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => {
          setMemo(event.target.value);
          // 저장 성공 직후 버튼이 잠겨 있는 상태에서, 메모를 다시 쓰기 시작하면 새로운 기록임을
          // 의미하므로 버튼을 다시 활성화합니다(아래 handleFileSelect와 동일한 이유).
          if (status === "saved") setStatus("idle");
        }}
        placeholder="예: 후문 냉장창고 앞에 적재 완료했습니다."
        value={memo}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {messageChannels.map((item) => (
          <button
            className={`h-11 rounded-lg border px-2 text-xs font-black transition ${
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

      <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">점주 발송 문구</p>
          <div className="flex shrink-0 gap-1.5">
            <button className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-black text-slate-700" onClick={shareOwnerMessage} type="button">
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
      <p className="mt-2 text-xs font-bold leading-5 text-blue-800">저장하면 배송 메모와 증빙 파일이 거래처 원장에 함께 누적됩니다.</p>

      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-blue-800">
        <MapPin className="h-3 w-3 shrink-0" />
        {locationStatus === "granted" && location
          ? `현재 위치 태그 준비됨 · 정확도 약 ${location.accuracy}m`
          : locationStatus === "loading"
            ? "위치 확인 중..."
            : locationStatus === "denied"
              ? "위치 접근이 거부되어 위치 태그 없이 저장됩니다"
              : locationStatus === "unavailable"
                ? "이 브라우저는 위치 확인을 지원하지 않습니다"
                : "위치 확인 대기 중"}
        {locationStatus === "denied" ? (
          <button className="-m-2 p-2 underline decoration-dotted underline-offset-2" onClick={requestLocation} type="button">
            다시 시도
          </button>
        ) : null}
      </p>

      <Button className="mt-3 h-11 w-full bg-blue-700 font-black hover:bg-blue-800" disabled={saving || status === "saved"} onClick={submit}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "saved" ? <CheckCircle2 className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
        {saving ? "저장 중" : status === "saved" ? "저장 완료" : "배송완료 저장"}
      </Button>

      {status === "error" ? (
        <p className="mt-2 text-xs font-bold text-rose-600">{errorDetail || "저장에 실패했습니다. 로그인 상태와 첨부 저장 설정을 확인해주세요."}</p>
      ) : null}
      {status === "saved" ? <p className="mt-2 text-xs font-bold text-teal-700">거래처 원장에 배송완료 기록이 저장되었습니다.</p> : null}
      {messageResult ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-bold leading-5 text-blue-800 ring-1 ring-inset ring-blue-100">{messageResult}</p> : null}
      {status === "saved" && manualRecipientPhone ? (
        <a
          className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white text-sm font-black text-blue-800 shadow-sm"
          href={createSmsHref(manualRecipientPhone, ownerMessage)}
        >
          <MessageSquareText className="h-4 w-4" />
          무료 문자앱으로 보내기
        </a>
      ) : null}

      <div className="mt-4 grid gap-2">
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
    </section>
  );
}

async function uploadDeliveryProof(customerId: string, file: File, title: string) {
  const formData = new FormData();
  formData.append("attachmentType", "delivery_proof");
  formData.append("customerId", customerId);
  formData.append("file", file);
  formData.append("title", title);

  return fetch("/api/customer-attachments/upload", {
    method: "POST",
    body: formData
  });
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
  const fallbackMemo = status === "arrived" ? `${loadingPosition || "요청하신 위치"}에 배송 적재 완료했습니다.` : status === "partial" ? "일부 품목은 확인 후 별도 안내드리겠습니다." : "배송 중 확인이 필요한 사항이 있어 안내드립니다.";
  const baseMemo = memo.trim() || templateMemo || fallbackMemo;
  const proofText = fileName ? `\n증빙자료: ${fileName}` : "";
  const contactName = company?.notificationSenderName?.trim() || company?.companyName?.trim() || "MAJU";
  const contactPhone = company?.notificationPhone?.trim();
  const contactText = contactPhone ? `\n문의: ${contactName} ${contactPhone}` : `\n문의: ${contactName}`;

  return `[${contactName} 배송 안내]\n${customerName} ${deliveryStatusLabel(status)}\n${baseMemo}${proofText}${contactText}`;
}

function deliveryStatusLabel(status: DeliveryStatus) {
  if (status === "partial") return "부분배송";
  if (status === "issue") return "이슈발생";
  return "도착완료";
}

function createSmsHref(phone: string, message: string) {
  const normalizedPhone = phone.startsWith("82") ? `0${phone.slice(2)}` : phone;
  return `sms:${normalizedPhone}?&body=${encodeURIComponent(message)}`;
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
