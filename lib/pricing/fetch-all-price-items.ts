import type { PriceItem, PriceState } from "../../domains/pricing/price-rules";

/** 마진 설정 상품을 전 페이지 읽는다(4쪽씩 동시). 읽는 도중 상품 수가 바뀌면 오류 — 일부만 보고 폴더 전체에 적용하는 일을 막는다. */
export async function fetchAllPriceItems(companyId: string, fetcher: typeof fetch = fetch): Promise<PriceItem[]> {
  const page = async (number: number) => {
    const response = await fetcher(`/api/price-sheets?${new URLSearchParams({ companyId, page: String(number) })}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.items)) throw new Error(body.message || "상품을 불러오지 못했습니다.");
    return body as PriceState;
  };
  const first = await page(1), all = [...first.items];
  if (!Number.isSafeInteger(first.total) || first.total < 0 || !Number.isSafeInteger(first.pageSize) || first.pageSize < 1) throw new Error("상품 수를 확인하지 못했습니다.");
  const pages = Math.ceil(first.total / first.pageSize);
  if (pages > 100000) throw new Error("상품 조회 범위를 확인해 주세요.");
  for (let start = 2; start <= pages; start += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, pages - start + 1) }, (_, index) => page(start + index)));
    for (const result of batch) { if (result.total !== first.total) throw new Error("상품 목록이 변경됐습니다. 다시 시도해 주세요."); all.push(...result.items); }
  }
  if (new Set(all.map((item) => item.id)).size !== first.total) throw new Error("상품 목록이 변경됐습니다. 다시 시도해 주세요.");
  return all;
}
