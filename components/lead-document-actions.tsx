"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { documentRequest } from "@/lib/pricing/document-client";
import { koreaDay, type DocumentDraft, type DocumentKind, type DocumentVersion } from "@/domains/pricing/document";
const PricingDocumentsWorkspace = dynamic(() => import("@/components/pricing-documents-workspace").then(module => module.PricingDocumentsWorkspace));
const PricingDocumentPreview = dynamic(() => import("@/components/pricing-document-preview").then(module => module.PricingDocumentPreview));

/** Shared by lead detail, sales and driver entry points. No legacy customer link is issued here. */
export function LeadDocumentActions({ leadId, recipient, companyId = "" }: {
  leadId: string;
  recipient: string;
  companyId?: string;
}) {
  const [kind, setKind] = useState<DocumentKind | null>(null);
  return <section aria-label="리드 문서 보내기" className="min-w-0 space-y-3">
    {!kind && <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setKind("sheet")}>단가표 보내기</Button>
      <Button type="button" variant="outline" onClick={() => setKind("quote")}>견적 보내기</Button>
    </div>}
    {kind && <DocumentSelection key={`${leadId}:${kind}`} companyId={companyId} recipient={recipient} kind={kind} onClose={() => setKind(null)} />}
  </section>;
}

function DocumentSelection({ companyId, recipient, kind, onClose }: {
  companyId: string; recipient: string; kind: DocumentKind; onClose: () => void;
}) {
  const [items, setItems] = useState<DocumentVersion[]>([]);
  const [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("전체"), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selected, setSelected] = useState<DocumentVersion | null>(null);
  const [editing, setEditing] = useState(false);
  const [manager, setManager] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setItems([]);
    void (async () => {
      const response = await documentRequest<{ items: DocumentDraft[]; total: number }>(companyId, "list", { page });
      const versions = await Promise.all(response.result.items.filter(item => item.content.kind === "sheet").map(async item => {
        const result = await documentRequest<DocumentVersion[]>(companyId, "versions", { id: item.id });
        return result.result[0];
      }));
      if (!active) return;
      setManager(response.manager); setTotal(response.result.total);
      setItems(versions.filter((version): version is DocumentVersion => Boolean(version) && version.content.validUntil >= koreaDay()));
    })().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "문서를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, page, retry]);
  const visible = items.filter(item => filter === "전체" || item.content.lines.some(line => line.visible && line.badge === filter));
  return <div className="maju-section-card min-w-0 space-y-3 p-3" aria-label={kind === "sheet" ? "단가표 선택" : "견적 원본 선택"} aria-busy={loading}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{recipient} · {kind === "sheet" ? "게시 단가표 선택" : "단가표를 복사해 견적 만들기"}</h3>
      <Button type="button" variant="ghost" onClick={() => { if (!editing || window.confirm("견적 작성을 닫을까요? 저장하지 않은 변경은 사라집니다.")) onClose(); }}>닫기</Button>
    </header>
    {editing && selected ? <PricingDocumentsWorkspace companyId={companyId} manager={manager}
      initialQuote={{ ...structuredClone(selected.content), kind: "quote", title: `${recipient} 견적서`, recipient }}
      onPublished={version => { setSelected(version); setEditing(false); }} /> : selected ? <>
      <p>{selected.content.title} · 버전 {selected.version}</p>
      <p role="status">리드 전용 공유는 준비 중입니다. 아직 링크를 발급하거나 발송 기록을 저장하지 않았습니다.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled>리드 공유 링크 발급</Button>
        <Button type="button" variant="outline" onClick={() => setSelected(null)}>다른 단가표 선택</Button>
      </div>
      <PricingDocumentPreview key={selected.id} version={selected} />
    </> : <>
      <p className="text-sm">{kind === "sheet" ? "게시된 버전으로 전달합니다. 행사·임박 단가표도 선택할 수 있습니다." : "게시 단가표를 복사한 뒤 매장별 가격을 조정하고 버전을 확정하세요."}</p>
      <div className="flex flex-wrap gap-2" aria-label="단가표 종류">
        {["전체", "행사", "임박"].map(value => <Button type="button" key={value} variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</Button>)}
      </div>
      {error ? <div role="alert"><p>{error}</p><Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>다시 시도</Button></div>
        : loading ? <p role="status">게시 단가표를 불러오는 중입니다.</p>
          : visible.length ? <ul className="space-y-2">{visible.map(version => <li key={version.id}>
            <Button type="button" variant="outline" className="h-auto min-h-11 w-full whitespace-normal break-words text-left" onClick={() => { setSelected(version); setEditing(kind === "quote"); }}>
              {version.content.title} · 버전 {version.version}{kind === "quote" ? " 복사" : " 선택"}
            </Button>
          </li>)}</ul> : <p role="status">이 페이지에 선택할 수 있는 게시 단가표가 없습니다. 다른 종류·다음 페이지를 확인하거나 문서 목록에서 게시해 주세요.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>이전</Button>
        <span>{page}페이지</span>
        <Button type="button" variant="outline" disabled={loading || page * 50 >= total} onClick={() => setPage(value => value + 1)}>다음</Button>
      </div>
    </>}
  </div>;
}
