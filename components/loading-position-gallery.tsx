"use client";

import { useState } from "react";
import { FileVideo, Lock, X } from "lucide-react";

// 적재위치 사진/영상은 절대 덮어쓰지 않고 계속 쌓이는 이력입니다(백엔드가 created_at 역순으로 반환).
// 그래서 화면에서도 "가장 최근 것 = 지금 기준" / "그 이전 것들 = 과거 기록(자물쇠)"로 구분해서 보여주고,
// 눌러서 원본 크기로 바로 미리보기 할 수 있게 합니다.
export type LoadingPositionMediaItem = {
  id: string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  title: string;
};

export function LoadingPositionGallery({ emptyMessage, items }: { emptyMessage?: string; items: LoadingPositionMediaItem[] }) {
  const [previewItem, setPreviewItem] = useState<LoadingPositionMediaItem | null>(null);

  if (!items.length) {
    return (
      <div className="grid h-24 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-center">
        <p className="px-3 text-xs font-bold text-slate-500">{emptyMessage || "아직 등록된 사진/영상이 없습니다."}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((item, index) => {
          const isLatest = index === 0;
          const isVideo = item.mimeType?.startsWith("video");

          return (
            <button
              className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left transition hover:border-teal-300"
              key={item.id}
              onClick={() => setPreviewItem(item)}
              type="button"
            >
              {isVideo ? (
                <video className="h-24 w-full bg-slate-900 object-cover" muted preload="metadata" src={item.fileUrl ? `${item.fileUrl}#t=0.5` : undefined} />
              ) : (
                <img alt={item.title} className="h-24 w-full object-cover" loading="lazy" src={item.fileUrl} />
              )}
              {isVideo ? (
                <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
                  <FileVideo className="h-6 w-6 text-white drop-shadow" />
                </span>
              ) : null}
              <span
                className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-black ${
                  isLatest ? "bg-teal-700 text-white" : "bg-slate-900/75 text-white"
                }`}
              >
                {isLatest ? "최신" : (
                  <>
                    <Lock className="h-2.5 w-2.5" />
                    이전 기록
                  </>
                )}
              </span>
              <span className="block truncate bg-white px-1.5 py-1 text-[10px] font-bold text-slate-500">{item.createdAt}</span>
            </button>
          );
        })}
      </div>

      {previewItem ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/75 p-4"
          onClick={() => setPreviewItem(null)}
        >
          <div className="relative w-full max-w-2xl" onClick={(event) => event.stopPropagation()}>
            <button
              aria-label="미리보기 닫기"
              className="absolute -top-11 right-0 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700"
              onClick={() => setPreviewItem(null)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
            {previewItem.mimeType?.startsWith("video") ? (
              <video autoPlay className="max-h-[80vh] w-full rounded-lg bg-black" controls src={previewItem.fileUrl} />
            ) : (
              <img alt={previewItem.title} className="max-h-[80vh] w-full rounded-lg bg-black object-contain" src={previewItem.fileUrl} />
            )}
            <p className="mt-2 text-center text-xs font-bold text-white">
              {previewItem.title} · {previewItem.createdAt}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
