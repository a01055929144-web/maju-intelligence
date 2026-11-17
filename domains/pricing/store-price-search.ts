export type StorePriceKind = "sheet" | "quote" | "catalog";
export type StorePriceRow = {
  id: string;
  name: string;
  spec: string;
  unit: string;
  price: number | null;
  recent: { price: number; date: string } | null;
};
export type StorePricePage = { rows: StorePriceRow[]; hasMore: boolean };

export function storePriceDocumentKey(href: string) {
  const [path, token] = href.split("#");
  return `${path === "/pricing-document" ? "shared" : "issued"}-${token?.split(".")[0] ?? ""}`;
}
