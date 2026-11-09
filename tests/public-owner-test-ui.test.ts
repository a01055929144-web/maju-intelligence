import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { publicOwnerTestModeRequested } from "../lib/store/public-owner-test-mode";

// Reuse the repository's TSX test adapter; Vitest preserves JSX in application files.
const dependencies: Record<string, unknown> = {
  react: React, "react/jsx-runtime": jsxRuntime,
  "./ui/button": { Button: "button" },
  "./ui/card": { Card: "div", CardContent: "div", CardHeader: "div", CardTitle: "h2" },
  "@/lib/store/public-owner-test-mode": { publicOwnerTestModeRequested },
};
function loadComponent(file: string) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
  new Function("require", "exports", compiled)((name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}
const { StoreOwnerActivationPanel } = loadComponent("components/store-kakao-entry.tsx");
const { PublicStoreTestBanner } = loadComponent("components/public-store-test-banner.tsx");

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
