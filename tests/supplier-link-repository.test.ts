import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { prepareSupplierLinkGroups, type SupplierLinkInput } from "../domains/pricing/supplier-link";
import { linkSupplierProducts } from "../lib/pricing/supplier-link-repository";

const companyId = "00000000-0000-4000-8000-000000000001";
const product = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const links: SupplierLinkInput[] = [
  { productId: product(1), rawName: "양파", spec: "10kg", unit: "BOX", cost: 10000, supplierName: "(주) 합성유통" },
  { productId: product(2), rawName: "감자", spec: "20kg", unit: "BOX", cost: 20000, supplierName: "주식회사 합성유통" }
];

describe("매입처 기존 상품 연결", () => {
  it("신규 매입처 상품의 가격·최종일은 null, 확정은 false가 DB 기본값이다", () => {
    const schema = readFileSync("supabase/migrations/20261015132054_quote_product_mapping.sql", "utf8");
    expect(schema).toMatch(/latest_cost numeric\(14,2\), cost_confirmed boolean not null default false, last_seen_date date/);
  });
  it("법인 표기가 다른 같은 매입처를 기존 표시 이름과 한 그룹·한 지문 체계로 묶는다", () => {
    const groups = prepareSupplierLinkGroups(links, ["합성유통(주)"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierName).toBe("합성유통(주)");
    expect(groups[0].products).toHaveLength(2);
    expect(new Set(groups[0].products.map((item) => item.sourceFingerprint.split(":")[0])).size).toBe(1);
  });

  it("전체 import·원가 이력 없이 일괄 upsert하고 같은 요청 재시도는 행을 늘리지 않는다", async () => {
    const supplierProducts = new Map<string, { id: string; supplier_id: string; source_fingerprint: string }>();
    const matches = new Map<string, { id: string; supplier_product_id: string; product_catalog_id: string; match_status: "confirmed" }>();
    const paths: string[] = [];
    const db = vi.fn(async (path: string, init?: RequestInit) => {
      paths.push(path);
      if (path.startsWith("product_catalog?")) return links.map((item) => ({ id: item.productId }));
      if (path.startsWith("product_suppliers?select=")) return [{ id: "supplier-1", name: "합성유통(주)" }];
      if (path.startsWith("product_suppliers?on_conflict=")) return [{ id: "supplier-1", name: "합성유통(주)" }];
      if (path.startsWith("supplier_products?on_conflict=")) {
        expect(init?.headers).toEqual({ Prefer: "resolution=ignore-duplicates,return=minimal" });
        (JSON.parse(String(init?.body)) as Array<{ supplier_id: string; source_fingerprint: string; latest_cost?: number; cost_confirmed?: boolean; last_seen_date?: string }>).forEach((row) => {
          expect(row).not.toHaveProperty("latest_cost");
          expect(row).not.toHaveProperty("cost_confirmed");
          expect(row).not.toHaveProperty("last_seen_date");
          const saved = supplierProducts.get(row.source_fingerprint) || { id: `sp-${supplierProducts.size + 1}`, ...row };
          supplierProducts.set(row.source_fingerprint, saved);
        });
        return undefined;
      }
      if (path.startsWith("supplier_products?select=id,supplier_id,source_fingerprint")) return Array.from(supplierProducts.values());
      if (path.startsWith("supplier_product_matches?select=")) return Array.from(matches.values());
      if (path === "supplier_product_matches") {
        const row = JSON.parse(String(init?.body)) as { supplier_product_id: string; product_catalog_id: string; match_status: "confirmed" };
        matches.set(row.supplier_product_id, { id: `match-${matches.size + 1}`, ...row });
        return undefined;
      }
      throw new Error(`unexpected ${path}`);
    });

    expect(await linkSupplierProducts(companyId, links, db as never)).toEqual({ linked: 2, attempted: 2 });
    expect(await linkSupplierProducts(companyId, links, db as never)).toEqual({ linked: 2, attempted: 2 });
    expect(supplierProducts.size).toBe(2);
    expect(matches.size).toBe(2);
    expect(paths.some((path) => /product_catalog_imports|supplier_product_cost_history/.test(path))).toBe(false);
    expect(paths.filter((path) => path.includes("company_id=eq.")).every((path) => path.includes(companyId))).toBe(true);
  });

  it("318개·80개 매입처도 매입처별 import 반복 없이 제한 동시성으로 처리한다", async () => {
    const many = Array.from({ length: 318 }, (_, index) => ({
      productId: product(index + 1), rawName: `합성 품목 ${index + 1}`, spec: "1kg", unit: "EA", cost: 1000 + index,
      supplierName: `합성 매입처 ${index % 80}`
    }));
    let supplierProductSequence = 0;
    const supplierProducts = new Map<string, { id: string; supplier_id: string; source_fingerprint: string }>();
    const paths: string[] = [];
    const db = vi.fn(async (path: string, init?: RequestInit) => {
      paths.push(path);
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (path.startsWith("product_catalog?")) return many.map((item) => ({ id: item.productId }));
      if (path.startsWith("product_suppliers?select=")) return [];
      if (path.startsWith("product_suppliers?on_conflict=")) return (JSON.parse(String(init?.body)) as Array<{ name: string }>).map((row, index) => ({ id: `supplier-${index}`, name: row.name }));
      if (path.startsWith("supplier_products?on_conflict=")) {
        (JSON.parse(String(init?.body)) as Array<{ supplier_id: string; source_fingerprint: string }>).forEach((row) => supplierProducts.set(row.source_fingerprint, { id: `sp-${++supplierProductSequence}`, ...row }));
        return undefined;
      }
      if (path.startsWith("supplier_products?select=id,supplier_id,source_fingerprint")) return Array.from(supplierProducts.values());
      if (path.startsWith("supplier_product_matches?select=")) return [];
      if (path === "supplier_product_matches") return undefined;
      throw new Error(`unexpected ${path}`);
    });
    const started = Date.now();
    await expect(linkSupplierProducts(companyId, many, db as never)).resolves.toEqual({ linked: 318, attempted: 318 });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(paths.filter((path) => path.startsWith("product_suppliers?on_conflict="))).toHaveLength(1);
    expect(paths.filter((path) => path.startsWith("supplier_products?on_conflict="))).toHaveLength(2);
    expect(paths.some((path) => /product_catalog_imports|supplier_product_cost_history/.test(path))).toBe(false);
  });

  it("타사 상품이 하나라도 섞이면 매입처 쓰기 전에 거절한다", async () => {
    const db = vi.fn(async (path: string) => path.startsWith("product_catalog?") ? [{ id: product(1) }] : []);
    await expect(linkSupplierProducts(companyId, links, db as never)).rejects.toThrow("타사 상품");
    expect(db).toHaveBeenCalledTimes(1);
  });

  it("다른 매입처의 같은 지문 행은 연결 대상에서 제외한다", async () => {
    const matchWrites: unknown[] = [];
    const db = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("product_catalog?")) return [{ id: product(1) }];
      if (path.startsWith("product_suppliers?select=")) return [{ id: "supplier-1", name: "합성유통" }];
      if (path.startsWith("product_suppliers?on_conflict=")) return [{ id: "supplier-1", name: "합성유통" }];
      if (path.startsWith("supplier_products?on_conflict=")) return undefined;
      if (path.startsWith("supplier_products?select=id,supplier_id,source_fingerprint")) {
        const fingerprint = "합성유통:name:양파|10kg|box";
        return [
          { id: "sp-target", supplier_id: "supplier-1", source_fingerprint: fingerprint },
          { id: "sp-other", supplier_id: "supplier-2", source_fingerprint: fingerprint }
        ];
      }
      if (path.startsWith("supplier_product_matches?select=")) {
        expect(path).toContain("sp-target");
        expect(path).not.toContain("sp-other");
        return [];
      }
      if (path === "supplier_product_matches") {
        matchWrites.push(JSON.parse(String(init?.body)));
        return undefined;
      }
      throw new Error(`unexpected ${path}`);
    });

    await expect(linkSupplierProducts(companyId, [links[0]], db as never)).resolves.toEqual({ linked: 1, attempted: 1 });
    expect(matchWrites).toHaveLength(1);
    expect(matchWrites[0]).toMatchObject({ supplier_product_id: "sp-target", product_catalog_id: product(1) });
  });

  it("기존 활성 연결 변경이 실패해도 먼저 삭제하지 않아 원래 연결을 보존한다", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const db = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push([path, init]);
      if (path.startsWith("product_catalog?")) return [{ id: product(1) }];
      if (path.startsWith("product_suppliers?select=")) return [{ id: "supplier-1", name: "합성유통" }];
      if (path.startsWith("product_suppliers?on_conflict=")) return [{ id: "supplier-1", name: "합성유통" }];
      if (path.startsWith("supplier_products?on_conflict=")) return undefined;
      if (path.startsWith("supplier_products?select=id,supplier_id,source_fingerprint")) return [{ id: "sp-1", supplier_id: "supplier-1", source_fingerprint: "합성유통:name:양파|10kg|box" }];
      if (path.startsWith("supplier_product_matches?select=")) return [{ id: "active-1", supplier_product_id: "sp-1", product_catalog_id: product(9), match_status: "confirmed" }];
      if (path.startsWith("supplier_product_matches?id=eq.active-1") && init?.method === "PATCH") throw new Error("synthetic failure");
      throw new Error(`unexpected ${path}`);
    });
    await expect(linkSupplierProducts(companyId, [links[0]], db as never)).rejects.toThrow("synthetic failure");
    expect(calls.some(([path, init]) => path.includes("active-1") && init?.method === "DELETE")).toBe(false);
  });
});
