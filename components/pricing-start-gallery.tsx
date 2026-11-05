"use client";

import { useEffect, useState } from "react";
import type { DocumentDraft, DocumentKind, ProductSet } from "@/domains/pricing/document";
import { DOCUMENT_PRESETS, type DocumentPreset } from "@/domains/pricing/document-presets";

/**
 * 11/4: 새 문서 시작 화면(시안 Start) — 빈 문서 · 우리 문서 복사 · MAJU 추천 · 내 템플릿 중 하나를 고릅니다.
 */
export function PricingStartGallery({ kind, loadDocuments, manager, onBlank, onClose, onCopy, onPreset, onTemplate, sets }: {
  readonly kind: DocumentKind;
  readonly loadDocuments: () => Promise<DocumentDraft[]>;
  readonly manager: boolean;
  readonly onBlank: (kind: DocumentKind) => void;
  readonly onClose: () => void;
  readonly onCopy: (document: DocumentDraft, kind: DocumentKind) => void;
  readonly onPreset: (preset: DocumentPreset, kind: DocumentKind) => void;
  readonly onTemplate: (set: ProductSet, kind: DocumentKind) => void;
  readonly sets: readonly ProductSet[];
}) {
  const [current, setCurrent] = useState<DocumentKind>(kind);
  const [documents, setDocuments] = useState<DocumentDraft[] | null>(null);
  useEffect(() => {
    let active = true;
    void loadDocuments().then((items) => { if (active) setDocuments(items); }).catch(() => { if (active) setDocuments([]); });
    return () => { active = false; };
  }, [loadDocuments]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label = current === "sheet" ? "단가표" : "견적서";
  const copies = (documents || []).slice(0, 6);
  const card = "flex min-h-24 flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-teal-500 hover:shadow-sm";

  return (
    <div aria-label="새 문서 시작" aria-modal="true" className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 sm:p-8" role="dialog">
      <div className="w-full max-w-4xl space-y-5 rounded-2xl bg-slate-50 p-4 shadow-xl sm:p-6">
        <header className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-black">새 {label} 만들기</h2>
          <span className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="문서 종류">
            {(manager ? (["sheet", "quote"] as const) : (["quote"] as const)).map((value) => (
              <button aria-pressed={current === value} className={`h-9 px-3 text-sm font-bold ${current === value ? "bg-teal-700 text-white" : "bg-white text-slate-700"}`} key={value} onClick={() => setCurrent(value)} type="button">{value === "sheet" ? "단가표" : "견적서"}</button>
            ))}
          </span>
          <button className="maju-button-secondary h-9 px-3" onClick={onClose} type="button">닫기</button>
        </header>

        <section className="space-y-2">
          <h3 className="text-sm font-black text-slate-700">처음부터</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <button className={`${card} border-dashed border-teal-400`} onClick={() => onBlank(current)} type="button">
              <span className="text-2xl font-black text-teal-700">+</span>
              <span className="font-bold">빈 {label}로 시작</span>
              <span className="text-xs text-slate-500">품목을 하나씩 찾아 담거나 엑셀로 한 번에</span>
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-black text-slate-700">MAJU 추천 모양 <span className="font-semibold text-slate-500">· 품목은 비어 있고 모양만 정해 둡니다</span></h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DOCUMENT_PRESETS.map((preset) => (
              <button className={card} key={preset.id} onClick={() => onPreset(preset, current)} type="button">
                <PresetThumb preset={preset} />
                <span className="font-bold">{preset.name}</span>
                <span className="text-xs text-slate-500">{preset.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-black text-slate-700">우리 문서 복사 <span className="font-semibold text-slate-500">· 품목·단가까지 그대로 가져와 {label}로 만듭니다</span></h3>
          {documents === null ? <p className="text-sm text-slate-500">불러오는 중입니다.</p> : copies.length ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {copies.map((document) => (
                <button className={card} key={document.id} onClick={() => onCopy(document, current)} type="button">
                  <span className="rounded bg-slate-100 px-1.5 text-xs font-bold text-slate-600">{document.content.kind === "sheet" ? "단가표" : "견적서"}</span>
                  <span className="line-clamp-1 font-bold">{document.content.title}</span>
                  <span className="text-xs text-slate-500">{document.content.lines.length}개 품목{document.content.recipient ? ` · ${document.content.recipient}` : ""}</span>
                </button>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">아직 복사할 문서가 없습니다.</p>}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-black text-slate-700">품목 템플릿·묶음 <span className="font-semibold text-slate-500">· 품목·순서만 불러오며 단가는 현재 마진 규칙으로 계산</span></h3>
          {sets.length ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {sets.map((set) => (
                <button className={card} key={set.id} onClick={() => onTemplate(set, current)} type="button">
                  <span className="rounded bg-amber-100 px-1.5 text-xs font-bold text-amber-900">{set.kind === "template" ? "템플릿" : "묶음"}</span>
                  <span className="line-clamp-1 font-bold">{set.name}</span>
                  <span className="text-xs text-slate-500">{set.productIds.length}개 품목</span>
                </button>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">저장한 템플릿이 없습니다. 목록 화면의 &lsquo;행사·묶음·템플릿&rsquo;에서 만들 수 있습니다.</p>}
        </section>
      </div>
    </div>
  );
}

function PresetThumb({ preset }: { readonly preset: DocumentPreset }) {
  const color = preset.patch.theme === "blue" ? "#1d4ed8" : preset.patch.theme === "green" ? "#047857" : "#1f2937";
  const cells = preset.display.columns * 4;
  return (
    <span aria-hidden className="block w-full rounded-md border border-slate-200 bg-white p-1.5" style={{ borderTop: `3px solid ${color}` }}>
      {preset.patch.layout === "cards" ? <span className="mb-1 grid grid-cols-3 gap-0.5">{[0, 1, 2].map((i) => <span className="h-3 rounded-sm bg-amber-200" key={i} />)}</span> : null}
      <span className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${preset.display.columns}, minmax(0,1fr))` }}>
        {Array.from({ length: cells }, (_, i) => <span className="h-1.5 rounded-sm bg-slate-200" key={i} />)}
      </span>
    </span>
  );
}
