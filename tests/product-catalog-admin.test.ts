import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { productCatalogMargin } from "../lib/product-catalog-presentation";

const adminSource = readFileSync(
  new URL("../components/product-catalog-admin.tsx", import.meta.url),
  "utf8",
);

describe("product catalog admin presentation", () => {
  it("calculates markup and exposes reverse margins", () => {
    expect(productCatalogMargin({ purchasePrice: 100, salesPrice: 125 })).toBe(25);
    expect(productCatalogMargin({ purchasePrice: 100, salesPrice: 80 })).toBe(-20);
  });

  it("does not calculate a margin without a usable purchase price", () => {
    expect(productCatalogMargin({ purchasePrice: 0, salesPrice: 100 })).toBeUndefined();
    expect(productCatalogMargin({ purchasePrice: 100 })).toBeUndefined();
  });

  it("uses the compact 920px product dialog with four desktop columns", () => {
    expect(adminSource).toContain('sm:max-w-[920px]');
    expect(adminSource).toContain('lg:grid-cols-4');
    expect(adminSource).toContain('aria-modal="true"');
    expect(adminSource).toContain('event.ctrlKey && event.key === "Enter"');
    expect(adminSource).not.toContain('max-w-[440px]');
  });

  it("requires preview, selection and explicit confirmation before batch category save", () => {
    expect(adminSource).toContain("분류 추천 미리보기");
    expect(adminSource).toContain("추천은 자동 저장되지 않습니다");
    expect(adminSource).toContain("전체 제외");
    expect(adminSource).toContain("확인하고 저장");
    expect(adminSource).toContain("start += 50");
  });
});
