import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PriceExplanationError from "../app/revenue/pricing/explanation/error";

it("offers a safe retry and catalog exit when the explanation read fails", () => {
  const html = renderToStaticMarkup(<PriceExplanationError error={new Error("database unavailable")} reset={vi.fn()} />);

  expect(html).toContain("단가 근거를 불러오지 못했습니다");
  expect(html).toContain("가격이 변경되지는 않습니다");
  expect(html).toContain("다시 시도");
  expect(html).toContain('href="/revenue/pricing/catalog"');
});
