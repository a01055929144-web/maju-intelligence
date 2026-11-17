"use client";

import { useEffect, useState } from "react";

type Photo = { id: string; sortOrder: number; url: string };

export function OrderDeliveryPhotos({ audience, companyId, orderId, storeAccountId }: {
  audience: "customer" | "store";
  companyId: string;
  orderId: string;
  storeAccountId?: string;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ orderId });
    if (audience === "store") { params.set("companyId", companyId); params.set("storeAccountId", storeAccountId || ""); }
    let cancelled = false;
    void fetch(`${audience === "store" ? "/api/store/order-delivery-photos" : "/api/orders/delivery-photos"}?${params}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((body: { photos?: Photo[] } | null) => { if (!cancelled) setPhotos(body?.photos ?? []); })
      .catch(() => { if (!cancelled) setPhotos([]); });
    return () => { cancelled = true; };
  }, [audience, companyId, orderId, storeAccountId]);
  if (!photos?.length) return null;
  return <section aria-label="배송 사진" className="space-y-2 border-t pt-3">
    <h3 className="font-medium">배송 사진</h3>
    <div className="flex flex-wrap gap-2">{photos.map((photo, index) => <a aria-label={`배송 사진 ${index + 1}`} className="block h-20 w-20 overflow-hidden rounded-lg border bg-slate-100" href={photo.url} key={photo.id} rel="noreferrer" target="_blank">
      {/* eslint-disable-next-line @next/next/no-img-element -- 10분짜리 비공개 서명 URL */}
      <img alt="" className="h-full w-full object-cover" loading="lazy" src={photo.url} />
    </a>)}</div>
  </section>;
}
