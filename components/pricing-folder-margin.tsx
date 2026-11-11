"use client";
import { useState } from "react";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { PricingBulkCommand, PricingCommand } from "@/application/pricing/manage-price-sheets";
import { rawPathsInFolder } from "@/domains/pricing/margin-tree";
import { fetchAllPriceItems } from "@/lib/pricing/fetch-all-price-items";

// CC-18: 폴더에 마진 한 번에. "하위 분류까지 같이 적용"(기본 켬)은 기존 분류 연결(category 명령)을 하위 경로마다 반복한다.
// 폴더 전용 마진 그룹("폴더 <경로>")을 만들거나 다시 쓰고, 그 분류들을 연결한 뒤 판매가를 다시 계산한다.
export function PricingFolderMargin({ companyId, folder, state, busy, send, onBusy, onMessage, onError }: {
  companyId: string; folder: string; state: PriceState; busy: boolean;
  send: (command?: PricingCommand | PricingBulkCommand) => Promise<PriceState>;
  onBusy: (value: boolean) => void; onMessage: (value: string) => void; onError: (value: string) => void;
}) {
  const [margin, setMargin] = useState("");
  const [withChildren, setWithChildren] = useState(true);
  async function apply() {
    const rate = Number(margin);
    if (margin === "" || !Number.isFinite(rate) || rate < 0 || rate > 1000 || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-8) { onError("마진율은 0~1000%(소수 둘째 자리까지)로 입력해 주세요."); return; }
    onBusy(true); onError(""); onMessage("");
    try {
      const all = await fetchAllPriceItems(companyId);
      const paths = rawPathsInFolder(all, state.categories, folder, withChildren);
      if (!paths.length) throw new Error("이 폴더에 적용할 분류가 없습니다.");
      const name = `폴더 ${folder}`.slice(0, 80);
      const own = state.groups.find((g) => g.name === name);
      const conflicts = paths.filter((path) => {
        const group = state.groups.find((g) => g.id === state.categories.find((link) => link.category === path)?.groupId);
        return group && group.id !== own?.id && group.margin !== rate;
      });
      if (conflicts.length && !window.confirm(`${conflicts.length}개 분류에 이미 다른 마진이 연결돼 있습니다. ${rate}%로 덮어쓸까요?\n(상품 개별 마진·직접 단가가 있는 상품은 그대로입니다.)`)) return;
      const before = new Set(state.groups.map((g) => g.id));
      let latest = await send({ action: "group", ...(own ? { id: own.id } : {}), name, margin: rate, rounding: state.defaultRounding });
      const groupId = own?.id ?? latest.groups.find((g) => !before.has(g.id) && g.name === name)?.id;
      if (!groupId) throw new Error("폴더 마진 그룹의 저장 결과를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      for (const path of paths) {
        if (latest.categories.some((link) => link.category === path && link.groupId === groupId)) continue;
        latest = await send({ action: "category", category: path, groupId });
      }
      if (latest.pendingCount > 0) await send({ action: "recalculate" });
      onMessage(`"${folder}" 폴더${withChildren ? "와 하위 분류" : ""} ${paths.length}개 분류에 마진 ${rate}%를 적용하고 판매가를 다시 계산했습니다.`);
    } catch (e) { onError(e instanceof Error ? e.message : "마진을 적용하지 못했습니다. 이미 적용된 분류는 유지되니 같은 값으로 다시 눌러 이어서 적용하세요."); }
    finally { onBusy(false); }
  }
  return <form aria-label="폴더 마진 적용" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" onSubmit={(e) => { e.preventDefault(); void apply(); }}>
    <label className="text-sm font-bold">폴더 마진(%)
      <input aria-label="폴더 마진율" className="mt-1 block h-10 w-28 rounded-md border border-slate-300 bg-white px-2 text-right text-sm font-normal" inputMode="decimal" onChange={(e) => setMargin(e.target.value)} placeholder="예: 15" value={margin} />
    </label>
    <label className="flex min-h-[44px] items-center gap-2 text-sm font-bold"><input checked={withChildren} onChange={(e) => setWithChildren(e.target.checked)} type="checkbox" />하위 분류까지 같이 적용</label>
    <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || margin === ""} type="submit">폴더에 마진 적용</button>
  </form>;
}
