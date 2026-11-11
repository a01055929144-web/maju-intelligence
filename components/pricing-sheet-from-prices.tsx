"use client";
import { useState } from "react";
import { compareCategoryPath, toFolderOrder } from "@/domains/pricing/category-tree";
import { inFolder } from "@/domains/pricing/margin-tree";
import { MAX_DOCUMENT_LINES } from "@/domains/pricing/document";
import { fetchAllPriceItems } from "@/lib/pricing/fetch-all-price-items";

export const SHEET_HANDOFF_KEY = "maju:new-sheet-product-ids";

// CC-18: "이 판매가로 단가표 만들기" — 고른 폴더(없으면 전체)의 판매가가 있는 활성 상품을 단가표 시작 화면으로 넘긴다.
// 가격은 넘기지 않는다: 문서 쪽에서 현재 회사 가격 규칙으로 다시 불러와 담는다(확정 때 스냅샷).
export function PricingSheetFromPrices({ companyId, folder, busy }: { companyId: string; folder: string | null; busy: boolean }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setWorking(true); setError("");
    try {
      const all = await fetchAllPriceItems(companyId);
      const picked = all.filter((item) => item.active && item.price > 0 && inFolder(item.category, folder));
      if (!picked.length) throw new Error("담을 수 있는 상품이 없습니다. 매입가가 있는 활성 상품이 필요합니다.");
      // CC-26: 문서에도 폴더 순서대로(같은 폴더 안은 기존 순서 유지 — sort는 안정). 순서를 못 읽으면 기존 순서 그대로.
      const order = await fetch(`/api/price-sheets/folder-order?${new URLSearchParams({ companyId })}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { folders: [] })).catch(() => ({ folders: [] }));
      const folderOrder = toFolderOrder(order.folders ?? []);
      if (folderOrder.size) picked.sort((a, b) => (a.category.trim() ? 0 : 1) - (b.category.trim() ? 0 : 1) || compareCategoryPath(a.category, b.category, folderOrder)); // 분류 없는 상품은 맨 뒤
      const ids = picked.slice(0, MAX_DOCUMENT_LINES).map((item) => item.id);
      if (picked.length > ids.length && !window.confirm(`상품이 ${picked.length.toLocaleString()}개라 문서 한도(${MAX_DOCUMENT_LINES}개)까지만 담습니다. 폴더를 좁혀 다시 만들 수도 있습니다. 계속할까요?`)) return;
      sessionStorage.setItem(SHEET_HANDOFF_KEY, JSON.stringify({ ids, label: folder ? folder.split(">").pop()?.trim() || "" : "" }));
      window.location.assign("/revenue/pricing/documents?startSheet=products");
    } catch (e) { setError(e instanceof Error ? e.message : "단가표를 시작하지 못했습니다."); }
    finally { setWorking(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || working} onClick={() => void start()} type="button">이 판매가로 단가표 만들기{folder ? ` (${folder.split(">").pop()?.trim()})` : " (전체)"}</button>
    {error ? <p className="text-sm font-bold text-rose-700" role="alert">{error}</p> : null}
  </div>;
}
