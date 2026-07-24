"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, ExternalLink, FileVideo, ImageIcon, Loader2, Plus, RefreshCw } from "lucide-react";

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

  const loadingAttachments = useMemo(
    () => attachments.filter((item) => item.attachmentType === "loading_position"),
    [attachments]
  );

  async function loadAttachments() {
    setLoadState("loading");
    const response = await fetch(`/api/customer-operations?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }).catch(() => null);
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

    setSaveState("saving");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("customerId", customerId);
    formData.append("attachmentType", "loading_position");
    formData.append("title", `배송 적재위치 - ${customerName}`);

    const response = await fetch("/api/customer-attachments/upload", {
      method: "POST",
      body: formData
    }).catch(() => null);

    if (!response?.ok) {
      setSaveState("error");
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
            <p className="font-black text-slate-950">배송 적재위치</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{loadingPosition || "적재위치 사진/영상을 현장에서 확인하고 보완합니다."}</p>
          </div>
        </div>
        <button className="rounded-lg border border-slate-200 p-2 text-slate-500" onClick={loadAttachments} type="button">
          <RefreshCw className={`h-4 w-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
        </button>
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-4 text-sm font-black text-blue-800 transition hover:bg-blue-100">
        <input accept="image/*,video/*" className="hidden" onChange={(event) => uploadFile(event.target.files?.[0] || null)} type="file" />
        {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saveState === "saving" ? "업로드 중" : "사진/영상 업로드"}
      </label>

      {saveState === "saved" ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          업로드되었습니다. 거래처 히스토리 첨부자료에도 반영됩니다.
        </p>
      ) : null}
      {saveState === "error" ? <p className="mt-2 text-xs font-bold text-rose-600">업로드에 실패했습니다. 로그인 상태와 Storage 연결을 확인해주세요.</p> : null}

      <div className="mt-4 grid gap-2">
        {loadState === "loading" ? <p className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">첨부자료를 불러오는 중입니다.</p> : null}
        {loadState === "error" ? <p className="rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-700">첨부자료를 불러오지 못했습니다.</p> : null}
        {loadState === "ready" && !loadingAttachments.length ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-500">아직 등록된 적재위치 사진/영상이 없습니다.</p>
        ) : null}
        {loadingAttachments.map((item) => (
          <a
            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:bg-blue-50"
            href={item.fileUrl || "#"}
            key={item.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
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
    </section>
  );
}
