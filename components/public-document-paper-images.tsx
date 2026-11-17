"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { printPages, type DocumentOutput } from "@/domains/pricing/document";
import { PageContent, pricingPaperImage, pricingPaperStyle } from "./pricing-document-preview";
import { Button } from "./ui/button";

export function PublicDocumentPaperImages({ document }: { document: DocumentOutput }) {
  const pages = useMemo(() => printPages(document), [document]);
  const paper = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{ pages: typeof pages; images: string[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const nodes = Array.from(paper.current?.querySelectorAll<HTMLElement>(".pricing-paper") ?? []);
    if (!nodes.length) return;
    let cancelled = false;
    async function capture() {
      const images: string[] = [];
      try {
        for (const node of nodes) {
          if (cancelled) return;
          images.push(await pricingPaperImage(node));
        }
        if (!cancelled) setResult({ pages, images });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void capture();
    return () => { cancelled = true; };
  }, [pages, retry]);

  const images = result?.pages === pages ? result.images : [];
  return <section aria-label="A4 문서 이미지" className="min-w-0 space-y-3">
    <div ref={paper} aria-hidden="true" className="pointer-events-none fixed -left-[10000px] top-0 w-max">
      <style>{pricingPaperStyle(1)}</style>
      {pages.map((page, index) => <div className="pricing-paper bg-white" key={index}>
        <PageContent data={page} page={index + 1} pages={pages.length}
          start={pages.slice(0, index).reduce((count, prior) => count + prior.lines.length, 0)} />
      </div>)}
    </div>
    {images.length ? images.map((src, index) => <Image unoptimized key={index}
      src={src} alt={`A4 문서 ${index + 1}쪽`} width={1588} height={2246} className="h-auto w-full border bg-white" />) :
      failed ? <div role="status">문서 이미지를 만들지 못했습니다. <Button variant="outline" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>다시 시도</Button></div>
        : <p role="status">A4 문서 이미지를 만들고 있습니다.</p>}
  </section>;
}
