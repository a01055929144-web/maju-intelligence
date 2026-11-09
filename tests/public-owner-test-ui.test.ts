import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { StoreOwnerActivationPanel } from "../components/store-kakao-entry";
import { PublicStoreTestBanner } from "../components/public-store-test-banner";

afterEach(() => vi.unstubAllEnvs());

it("uses synthetic store defaults without exposing a server test number or current Kakao contact", () => {
  const html = renderToStaticMarkup(createElement(StoreOwnerActivationPanel, {
    enabled: true, profileStep: true, testMode: true, initialStorePhone: "synthetic-private-canary",
  }));
  expect(html).toContain("시험 전용 매장"); expect(html).toContain("시험 배송지");
  expect(html).toContain("서버에 지정된 시험번호");
  expect(html).not.toContain("synthetic-private-canary");
  expect(html).not.toContain("사업자등록번호<input");
});

it("shows the test banner only when explicitly requested and leaves ordinary signup fields required", () => {
  expect(renderToStaticMarkup(createElement(PublicStoreTestBanner))).toBe("");
  vi.stubEnv("STORE_PUBLIC_TEST_MODE_ENABLED", "true");
  expect(renderToStaticMarkup(createElement(PublicStoreTestBanner))).toContain("시험 전용");
  const ordinary = renderToStaticMarkup(createElement(StoreOwnerActivationPanel, { enabled: true, profileStep: true }));
  expect(ordinary).toContain("사업자등록번호"); expect(ordinary).not.toContain("시험 전용 매장");
});
