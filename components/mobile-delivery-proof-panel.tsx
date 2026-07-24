"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Copy, ExternalLink, FileVideo, ImageIcon, Loader2, MessageSquareText, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const deliveryStatuses: Array<{ label: string; value: DeliveryStatus }> = [
  { label: "도착완료", value: "arrived" },
  { label: "부분배송", value: "partial" },
  { label: "이슈발생", value: "issue" }
];

const messageChannels: Array<{ label: string; value: MessageChannel }> = [
  { label: "카톡 발송 대기", value: "kakao" },
  { label: "문자 발송 대기", value: "sms" }
];

export function MobileDeliveryProofPanel({
  customerId,
  customerName,
  loadingPosition
}: {
  customerId: string;
  customerName: string;
  loadingPosition?: string;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>("arrived");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loadingProofs, setLoadingProofs] = useState(false);
  const [memo, setMemo] = useState("");
  const [messageChannel, setMessageChannel] = useState<MessageChannel>("kakao");
  const [notes, setNotes] = useState<OperationNote[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const deliveryProofAttachments = useMemo(() => attachments.filter((item) => item.attachmentType === "delivery_proof"), [attachments]);
  const deliveryNotes = useMemo(() => notes.filter((item) => item.noteType === "delivery"), [notes]);
  const ownerMessage = createOwnerMessage(customerName, memo, deliveryStatus, file?.name || "", loadingPosition);

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
    const memoText = `${ownerMessage}\n\n배송 상태: ${deliveryStatusLabel(deliveryStatus)}\n알림 방식: ${messageChannel === "kakao" ? "카톡 발송 대기" : "문자 발송 대기"}${file?.name ? `\n증빙 파일: ${file.name}` : ""}`;

    const noteRequest = fetch("/api/customer-operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "note",
        customerId,
        memo: memoText,
        nextAction: messageChannel === "kakao" ? "카카오 알림톡 발송" : "문자 발송",
        noteType: "delivery"
      })
    });
    const attachmentRequest = file ? uploadDeliveryProof(customerId, file, file.name) : Promise.resolve(new Response(null, { status: 200 }));
    const [noteResponse, attachmentResponse] = await Promise.all([noteRequest, attachmentRequest]).catch(() => [null, null]);

    setSaving(false);

    if (!noteResponse?.ok || !attachmentResponse?.ok) {
      setStatus("error");
      return;
    }

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

  useEffect(() => {
    loadProofs();
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
            <p className="font-black text-slate-950">배송완료 기록</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{customerName} 도착 사진과 점주 발송 문구를 저장합니다.</p>
          </div>
        </div>
        <button className="rounded-lg border border-blue-200 bg-white p-2 text-blue-700" onClick={loadProofs} type="button">
          <RefreshCw className={`h-4 w-4 ${loadingProofs ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {deliveryStatuses.map((item) => (
          <button
            className={`h-10 rounded-lg border px-2 text-xs font-black transition ${
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
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          type="file"
        />
        <Plus className="h-4 w-4" />
        {file ? file.name : "도착 사진/영상 선택"}
      </label>

      <textarea
        className="mt-3 min-h-[92px] resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        onChange={(event) => setMemo(event.target.value)}
        placeholder="예: 후문 냉장창고 앞에 적재 완료했습니다."
        value={memo}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        {messageChannels.map((item) => (
          <button
            className={`h-10 rounded-lg border px-2 text-xs font-black transition ${
              messageChannel === item.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
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
          <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-black text-slate-700" onClick={copyOwnerMessage} type="button">
            <Copy className="h-3.5 w-3.5" />
            복사
          </button>
        </div>
        <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">{ownerMessage}</p>
        {copyMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{copyMessage}</p> : null}
      </div>

      <Button className="mt-3 h-11 w-full bg-blue-700 font-black hover:bg-blue-800" disabled={saving} onClick={submit}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "saved" ? <CheckCircle2 className="h-4 w-4" /> : <MessageSquareText className="h-4 w-4" />}
        {saving ? "저장 중" : status === "saved" ? "저장 완료" : "배송완료 저장"}
      </Button>

      {status === "error" ? <p className="mt-2 text-xs font-bold text-rose-600">저장에 실패했습니다. 로그인 상태와 첨부 저장 설정을 확인해주세요.</p> : null}
      {status === "saved" ? <p className="mt-2 text-xs font-bold text-teal-700">거래처 히스토리에 배송완료 기록이 저장되었습니다.</p> : null}

      <div className="mt-4 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">최근 배송완료 증빙</p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">{deliveryProofAttachments.length}건</span>
        </div>
        {loadingProofs ? <p className="rounded-lg bg-white p-3 text-sm font-bold text-slate-500">증빙자료를 불러오는 중입니다.</p> : null}
        {!loadingProofs && !deliveryProofAttachments.length ? <p className="rounded-lg bg-white p-3 text-sm font-bold text-slate-500">아직 배송완료 증빙이 없습니다.</p> : null}
        {deliveryProofAttachments.slice(0, 4).map((item) => (
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

      <div className="mt-4 grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">최근 배송 메모</p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">{deliveryNotes.length}건</span>
        </div>
        {!loadingProofs && !deliveryNotes.length ? <p className="rounded-lg bg-white p-3 text-sm font-bold text-slate-500">아직 배송 메모가 없습니다.</p> : null}
        {deliveryNotes.slice(0, 3).map((item) => (
          <div className="rounded-lg border border-blue-100 bg-white p-3" key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-black text-blue-700">{item.nextAction || "배송 기록"}</p>
              <p className="shrink-0 text-[11px] font-bold text-slate-400">{formatHistoryDate(item.createdAt)}</p>
            </div>
            <p className="mt-2 whitespace-pre-line text-xs font-bold leading-5 text-slate-700">{item.memo}</p>
            <p className="mt-2 text-[11px] font-bold text-slate-400">{item.createdByName}</p>
          </div>
        ))}
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

function createOwnerMessage(customerName: string, memo: string, status: DeliveryStatus, fileName: string, loadingPosition?: string) {
  const baseMemo = memo.trim() || (status === "arrived" ? `${loadingPosition || "요청하신 위치"}에 배송 적재 완료했습니다.` : status === "partial" ? "일부 품목은 확인 후 별도 안내드리겠습니다." : "배송 중 확인이 필요한 사항이 있어 안내드립니다.");
  const proofText = fileName ? `\n증빙자료: ${fileName}` : "";

  return `[MAJU 배송 안내]\n${customerName} ${deliveryStatusLabel(status)}\n${baseMemo}${proofText}`;
}

function deliveryStatusLabel(status: DeliveryStatus) {
  if (status === "partial") return "부분배송";
  if (status === "issue") return "이슈발생";
  return "도착완료";
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
