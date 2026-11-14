import { afterEach, expect, it, vi } from "vitest";
import { buildSupplierProductWrite } from "../domains/product/catalog-import";

afterEach(() => vi.useRealTimers());

it("날짜 없는 상품 가져오기: 한국 새벽(UTC 전날)에도 오늘(한국) 날짜로 저장된다", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T16:30:00Z")); // 한국 11/14 01:30
  const row = buildSupplierProductWrite("company", "supplier", { name: "가짜상품", cost: 1000, costConfirmed: true } as never);
  expect(row.last_seen_date).toBe("2026-11-14");
});

it("날짜가 있으면 그 날짜를 그대로 쓴다(이미 저장된 값은 바꾸지 않음)", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T16:30:00Z"));
  const row = buildSupplierProductWrite("company", "supplier", { date: "2026-11-01", name: "가짜상품", cost: 1000, costConfirmed: true } as never);
  expect(row.last_seen_date).toBe("2026-11-01");
});
