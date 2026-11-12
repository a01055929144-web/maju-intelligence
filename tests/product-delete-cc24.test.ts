import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// CC-24 상품 삭제 화면·API 계약: DB 함수(cc24_delete_products, 운영 적용 11/12)를 숫자 확인 → 적용 두 단계로 부른다.
const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
vi.mock("../lib/store", () => ({
  supabaseRequest: async (path: string, init?: { body?: string }) => {
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : {} });
    if (path.startsWith("rpc/cc24_delete_products")) return { requested: 2, found: 2, deletable: 1, hideOnly: 1, applied: Boolean(calls.at(-1)!.body.p_apply) };
    return [{ id: "x" }];
  },
}));

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("product delete (CC-24)", () => {
  afterEach(() => { calls.length = 0; });
  it("counts first (apply=false) and applies only when asked, passing the company", async () => {
    const { deleteProductsForAdmin } = await import("../lib/product-catalog-admin");
    const counted = await deleteProductsForAdmin("company-1", [id(1), id(2), id(1)], false);
    expect(counted).toMatchObject({ deletable: 1, hideOnly: 1, applied: false });
    expect(calls[0]).toEqual({ path: "rpc/cc24_delete_products", body: { p_company: "company-1", p_ids: [id(1), id(2)], p_apply: false } });
    await deleteProductsForAdmin("company-1", [id(1)], true);
    expect(calls[1].body.p_apply).toBe(true);
  });
  it("rejects empty, non-uuid and more than 500 ids before calling the database", async () => {
    const { deleteProductsForAdmin, restoreProductsForAdmin } = await import("../lib/product-catalog-admin");
    await expect(deleteProductsForAdmin("c", [], true)).rejects.toThrow("1~500개");
    await expect(deleteProductsForAdmin("c", ["not-a-uuid"], true)).rejects.toThrow("1~500개");
    await expect(restoreProductsForAdmin("c", Array.from({ length: 501 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`))).rejects.toThrow("1~500개");
    expect(calls).toHaveLength(0);
  });
  it("restore only touches this company's hidden products", async () => {
    const { restoreProductsForAdmin } = await import("../lib/product-catalog-admin");
    expect(await restoreProductsForAdmin("company-1", [id(3)])).toBe(1);
    expect(calls[0].path).toContain("company_id=eq.company-1");
    expect(calls[0].path).toContain("is_active=eq.false");
    expect(calls[0].body).toMatchObject({ is_active: true });
  });
});

describe("product delete screen and API gate", () => {
  const route = readFileSync("app/api/product-catalog/route.ts", "utf8");
  const screen = readFileSync("components/product-catalog-admin.tsx", "utf8");
  it("only owners/managers may delete or restore (staff get 403)", () => {
    expect(route).toContain('body?.action === "delete-products" || body?.action === "restore-products"');
    expect(route).toContain("canManagePriceSheets(scope.customerSession)");
    expect(route).toContain("status: 403");
  });
  it("the confirm dialog shows the two numbers and the screen counts before deleting", () => {
    expect(screen).toContain('action: "delete-products", apply: false');
    expect(screen).toContain("개 완전 삭제 · ${hideOnly}개 숨김");
    expect(screen).toContain('action: "delete-products", apply: true');
    expect(screen).toContain("되돌릴 수 없습니다");
  });
});
