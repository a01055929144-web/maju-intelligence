"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { LoadingPositionGallery } from "@/components/loading-position-gallery";
import { openMobileStep } from "@/components/mobile-accordion-step";
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
    }, 120000).catch(() => null);

    if (!response?.ok) {
      const errorPayload = (await response?.json().catch(() => null)) as { message?: string } | null;
      setSaveState("error");
      setSaveErrorMessage(errorPayload?.message || "업로드에 실패했습니다. 로그인 상태와 Storage 연결을 확인해주세요.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as { attachment?: Attachment; persisted?: boolean; uploaded?: boolean } | null;
    if (!payload?.attachment || payload.persisted !== true || payload.uploaded !== true) {
      setSaveState("error");
      setSaveErrorMessage("파일이 원장에 연결됐는지 확인하지 못했습니다. 다시 시도해주세요.");
      return;
    }
    setAttachments((current) => [payload.attachment!, ...current]);
    setSaveState("saved");
    window.setTimeout(() => openMobileStep("delivery-proof"), 450);
  }

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <section className="mobile-card rounded-xl border p-3" id="loading-position">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mobile-accent-soft grid h-10 w-10 shrink-0 place-items-center rounded-lg">
            <Camera className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="mobile-accent-soft inline-flex rounded-full px-2 py-1 text-[11px] font-black">3 · 적재 확인</span>
            <p className="mt-1 truncate font-black">{loadingPosition || "사진/영상 확인"}</p>
          </div>
        </div>
        <button aria-label="적재위치 자료 새로고침" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500" onClick={loadAttachments} type="button">
          <RefreshCw className={`h-4 w-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
        </button>
      </div>

      <label className="mobile-secondary-action mt-3 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-2 text-sm font-black transition">
        <input
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            event.target.value = "";
            void uploadFile(file);
          }}
          type="file"
        />
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

      <div className="mt-3">
        {loadState === "loading" ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            불러오는 중
          </p>
        ) : null}
        {loadState === "error" ? (
          <div className="rounded-lg bg-rose-50 p-3 text-rose-700">
            <p className="text-sm font-bold">적재위치 자료를 불러오지 못했습니다.</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-rose-600">연결 상태를 확인한 뒤 다시 불러오세요. 배송 완료 입력은 아래에서 계속할 수 있습니다.</p>
            <button className="mt-2 min-h-11 rounded-lg bg-white px-4 text-xs font-black shadow-sm ring-1 ring-inset ring-rose-200" onClick={loadAttachments} type="button">다시 불러오기</button>
          </div>
        ) : null}
        {loadState === "ready" && loadingAttachments.length ? (
          <details className="group rounded-lg border border-slate-200">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-bold text-slate-600">
              기존 적재 자료 <span>{loadingAttachments.length}건 · 보기</span>
            </summary>
            <div className="border-t border-slate-100 p-2">
              <LoadingPositionGallery emptyMessage="" items={loadingAttachments} />
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
