"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileVideo, ImageIcon, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LoadingPositionGallery } from "@/components/loading-position-gallery";
import { formatUploadSizeMb, MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";

type AttachmentItem = {
  id: string;
  attachmentType: string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  title: string;
};

const slots = [
  { accept: "image/*,.pdf", description: "사업자 정보 원본", key: "business_license", label: "사업자등록증", required: true },
  { accept: "image/*,.pdf", description: "필요 시 마스킹 후 보관", key: "identity_document", label: "신분증", required: false },
  { accept: "image/*,.pdf", description: "정산 계좌 확인", key: "bank_account", label: "통장사본", required: false },
  { accept: "image/*,video/*", description: "후문, 냉장고, 적재 위치", key: "loading_position", label: "배송 적재위치", required: false }
];

export function CustomerAttachmentUploadPanel({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  async function loadAttachments() {
    setLoadState("loading");
    const params = new URLSearchParams({ customerId });
    const companyId = getCurrentCompanyId();
    if (companyId) params.set("companyId", companyId);
    const response = await fetch(`/api/customer-operations?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setLoadState("error");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { attachments?: AttachmentItem[] } | null;
    setAttachments(payload?.attachments || []);
    setLoadState("ready");
  }

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const hasBusinessLicense = attachments.some((item) => item.attachmentType === "business_license");
  const requiredCount = slots.filter((slot) => slot.required).length;
  const completedSlotCount = slots.filter((slot) => attachments.some((item) => item.attachmentType === slot.key)).length;
  const loadingPositionCount = attachments.filter((item) => item.attachmentType === "loading_position").length;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">{customerName} 첨부자료</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">사업자 서류, 정산 계좌, 배송 적재위치 자료를 거래처 원장에 저장합니다.</p>
        </div>
        <Badge className={hasBusinessLicense ? "w-fit bg-teal-700 text-white" : "w-fit bg-amber-100 text-amber-800"}>
          필수 {hasBusinessLicense ? requiredCount : 0}/{requiredCount}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <AttachmentSummary label="첨부 항목" value={`${completedSlotCount}/${slots.length}`} />
        <AttachmentSummary label="전체 파일" value={`${attachments.length.toLocaleString()}개`} />
        <AttachmentSummary label="적재위치" value={loadingPositionCount ? `${loadingPositionCount.toLocaleString()}개` : "보완 필요"} />
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        {slots.map((slot) => (
          <AttachmentSlot
            accept={slot.accept}
            attachmentType={slot.key}
            customerId={customerId}
            customerName={customerName}
            description={slot.description}
            existingItems={attachments.filter((item) => item.attachmentType === slot.key)}
            key={slot.key}
            label={slot.label}
            loadState={loadState}
            onUploaded={(item) => setAttachments((current) => [item, ...current])}
            required={slot.required}
          />
        ))}
      </div>
    </div>
  );
}

function AttachmentSlot({
  accept,
  attachmentType,
  customerId,
  customerName,
  description,
  existingItems,
  label,
  loadState,
  onUploaded,
  required
}: {
  accept: string;
  attachmentType: string;
  customerId: string;
  customerName: string;
  description: string;
  existingItems: AttachmentItem[];
  label: string;
  loadState: "idle" | "loading" | "ready" | "error";
  onUploaded: (item: AttachmentItem) => void;
  required: boolean;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadCount, setUploadCount] = useState(0);

  async function uploadFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length || saveState === "saving") return;

    const oversizedFile = files.find((file) => file.size > MAX_UPLOAD_SIZE_BYTES);
    if (oversizedFile) {
      setSaveState("error");
      setErrorMessage(`${oversizedFile.name} 용량이 ${formatUploadSizeMb(oversizedFile.size)}로 최대 50MB를 초과합니다.`);
      return;
    }

    setErrorMessage("");
    setUploadCount(files.length);
    setSaveState("saving");

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customerId", customerId);
      formData.append("attachmentType", attachmentType);
      formData.append("title", `${label} - ${customerName}`);
      const companyId = getCurrentCompanyId();
      if (companyId) formData.append("companyId", companyId);

      const response = await fetch("/api/customer-attachments/upload", { method: "POST", body: formData }).catch(() => null);

      if (!response?.ok) {
        const payload = (await response?.json().catch(() => null)) as { message?: string } | null;
        setSaveState("error");
        setErrorMessage(payload?.message || `${file.name} 업로드에 실패했습니다. 다시 시도해주세요.`);
        return;
      }

      const payload = (await response.json().catch(() => null)) as { attachment?: AttachmentItem } | null;
      if (payload?.attachment) onUploaded(payload.attachment);
    }

    setSaveState("saved");
  }

  const hasFile = Boolean(existingItems.length);

  return (
    <div className={`grid min-h-[206px] grid-rows-[auto_1fr_auto_auto] rounded-md border p-3 ${required && !hasFile ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex min-h-10 items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-black leading-5 text-slate-950">{label}</p>
        <Badge className={`shrink-0 ${required ? (hasFile ? "bg-teal-700 text-white" : "bg-amber-100 text-amber-800") : hasFile ? "bg-teal-700 text-white" : "bg-white text-slate-500"}`}>
          {required ? (hasFile ? "충족" : "필수") : hasFile ? `${existingItems.length}개` : "선택"}
        </Badge>
      </div>

      <div className="min-h-0">
        <p className="min-h-10 text-xs font-semibold leading-5 text-slate-500">{description}</p>
        {existingItems.length && attachmentType === "loading_position" ? (
          <div className="mt-2 max-h-[160px] overflow-y-auto pr-1">
            <LoadingPositionGallery items={existingItems} />
          </div>
        ) : existingItems.length ? (
          <div className="mt-2 max-h-[76px] space-y-1 overflow-y-auto pr-1">
            {existingItems.map((item) => (
              <a
                className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                href={item.fileUrl || "#"}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="shrink-0 text-slate-500">
                  {item.mimeType?.startsWith("video") ? <FileVideo className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                </span>
                <p className="min-w-0 flex-1 truncate text-xs font-black text-slate-800">{item.title}</p>
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
              </a>
            ))}
          </div>
        ) : loadState === "loading" ? (
          <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-xs font-bold text-slate-400 ring-1 ring-inset ring-slate-200">불러오는 중...</p>
        ) : (
          <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-xs font-bold text-slate-400 ring-1 ring-inset ring-slate-200">아직 업로드된 파일 없음</p>
        )}
      </div>

      <label className="mt-3 flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950">
        <input accept={accept} className="sr-only" multiple onChange={(event) => uploadFiles(event.target.files)} type="file" />
        {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {saveState === "saving" ? `${uploadCount.toLocaleString()}개 업로드 중` : "+ 파일 업로드"}
      </label>
      {saveState === "saved" ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-slate-700">
          <CheckCircle2 className="h-3 w-3" />
          {uploadCount.toLocaleString()}개 업로드 완료
        </p>
      ) : <span className="mt-1.5 h-[16px]" aria-hidden="true" />}
      {saveState === "error" ? <p className="mt-1.5 text-[11px] font-bold text-rose-600">{errorMessage}</p> : null}
    </div>
  );
}

function AttachmentSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function getCurrentCompanyId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}
