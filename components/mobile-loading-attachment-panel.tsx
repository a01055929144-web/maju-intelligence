"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { LoadingPositionGallery } from "@/components/loading-position-gallery";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { formatUploadSizeMb, MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";

type Attachment = {
  id: string;
  attachmentType: string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  title: string;
};

type LoadState = "idle" | "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

export function MobileLoadingAttachmentPanel({
  customerId,
  customerName,
  loadingPosition
}: {
  customerId: string;
  customerName: string;
  loadingPosition?: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");

  const loadingAttachments = useMemo(
    () => attachments.filter((item) => item.attachmentType === "loading_position"),
    [attachments]
  );

  async function loadAttachments() {
    setLoadState("loading");
    const response = await fetchWithTimeout(`/api/customer-operations?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }, 12000).catch(() => null);
    if (!response?.ok) {
      setLoadState("error");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { attachments?: Attachment[] } | null;
    setAttachments(payload?.attachments || []);
    setLoadState("ready");
  }

  async function uploadFile(file: File | null) {
    if (!file || saveState === "saving") return;

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setSaveState("error");
      setSaveErrorMessage(`파일 용량이 ${formatUploadSizeMb(file.size)}로 최대 50MB를 초과합니다. 영상 길이를 줄이거나 화질을 낮춰 다시 선택해주세요.`);
      return;
    }

    setSaveErrorMessage("");
    setSaveState("saving");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customerId", customerId);
    formData.append("attachmentType", "loading_position");
    formData.append("title", `배송 적재위치 - ${customerName}`);

    const response = await fetchWithTimeout("/api/customer-attachments/upload", {
      method: "POST",
      body: formData
    }, 20000).catch(() => null);

    if (!response?.ok) {
      setSaveState("error");
      setSaveErrorMessage("업로드에 실패했습니다. 로그인 상태와 Storage 연결을 확인해주세요.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { attachment?: Attachment } | null;
    if (payload?.attachment) setAttachments((current) => [payload.attachment!, ...current]);
    setSaveState("saved");
  }

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4" id="loading-position">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <Camera className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="mb-2 inline-flex rounded-full bg-blue-100 px-2 py-1 text-[11px] font-black text-blue-800">적재위치</span>
            <p className="font-black text-slate-950">{loadingPosition || "사진/영상 확인"}</p>
          </div>
        </div>
        <button aria-label="적재위치 자료 새로고침" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500" onClick={loadAttachments} type="button">
          <RefreshCw className={`h-4 w-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
        </button>
      </div>

      <label className="mt-4 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800 transition hover:bg-blue-100">
        <input accept="image/*,video/*" className="hidden" onChange={(event) => uploadFile(event.target.files?.[0] || null)} type="file" />
        {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saveState === "saving" ? "업로드 중" : "사진/영상"}
      </label>

      {saveState === "saved" ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          업로드 완료
        </p>
      ) : null}
      {saveState === "error" ? <p className="mt-2 text-xs font-bold text-rose-600">{saveErrorMessage || "업로드에 실패했습니다. 로그인 상태와 Storage 연결을 확인해주세요."}</p> : null}

      <div className="mt-4">
        {loadState === "loading" ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            불러오는 중
          </p>
        ) : null}
        {loadState === "error" ? <p className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">첨부자료를 불러오지 못했습니다.</p> : null}
        {loadState === "ready" ? (
          <LoadingPositionGallery emptyMessage="등록된 자료 없음" items={loadingAttachments} />
        ) : null}
      </div>
    </section>
  );
}
