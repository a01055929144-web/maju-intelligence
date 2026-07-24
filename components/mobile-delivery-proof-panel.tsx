"use client";

import { useState } from "react";
import { Camera, CheckCircle2, Copy, Loader2, MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type DeliveryStatus = "arrived" | "partial" | "issue";
type MessageChannel = "kakao" | "sms";

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
  const [file, setFile] = useState<File | null>(null);
  const [memo, setMemo] = useState("");
  const [messageChannel, setMessageChannel] = useState<MessageChannel>("kakao");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const ownerMessage = createOwnerMessage(customerName, memo, deliveryStatus, file?.name || "", loadingPosition);

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
  }

  async function copyOwnerMessage() {
    try {
      await navigator.clipboard.writeText(ownerMessage);
      setCopyMessage("점주 발송 문구를 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다. 문구를 직접 선택해 복사하세요.");
    }
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4" id="delivery-proof">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-700 text-white">
          <Camera className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-black text-slate-950">배송완료 기록</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{customerName} 도착 사진과 점주 발송 문구를 저장합니다.</p>
        </div>
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
