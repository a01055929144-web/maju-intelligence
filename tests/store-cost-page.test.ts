import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ feature: vi.fn(), rollout: vi.fn(), member: vi.fn(), fixture: vi.fn() }));
// Execute the actual TSX page with isolated server dependencies; the project test runner preserves JSX.
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import * as accessRules from "../domains/organization/store-cost-access";
const dependencies: Record<string, unknown> = {
  "react/jsx-runtime": jsxRuntime,
  "next/navigation": { notFound: () => { throw new Error("404"); } },
  "@/lib/auth": { storeMemberSessionEnabled: () => false },
  "@/lib/pricing/feature": { priceSheetsEnabled: () => true },
  "@/lib/pricing/store-order-feature": { storeOrderingEnabled: () => true },
  "@/lib/feature-flags": { isFeatureEnabled: mocks.feature, hasFeatureRollout: mocks.rollout },
  "@/lib/store/07-store-member-context": { getStoreMemberContext: mocks.member },
  "@/lib/ci-layout-fixtures": { isCiLayoutFixturesEnabled: mocks.fixture },
  "@/components/storefront-workspace": { StorefrontWorkspace: () => null },
  "@/components/public-store-test-banner": { PublicStoreTestBanner: () => null },
  "@/domains/organization/store-cost-access": accessRules,
};
const compiled = ts.transpileModule(readFileSync("app/store/page.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports: Record<string, (input: { searchParams: Promise<unknown> }) => Promise<React.ReactElement>> = {};
new Function("require", "exports", compiled)((name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
}, exports);
const StorePage = exports.default;
const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
async function workspace(params = { companyId, storeAccountId }) {
  const page = await StorePage({ searchParams: Promise.resolve(params) });
  const workspace = React.Children.toArray(page.props.children).find(child => React.isValidElement(child) && "costAccess" in (child.props as object)) as React.ReactElement<{ costAccess: unknown }>;
  return workspace;
}
async function access(params = { companyId, storeAccountId }) {
  return (await workspace(params)).props.costAccess;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.fixture.mockReturnValue(false); mocks.feature.mockReturnValue(false);
  mocks.rollout.mockReturnValue(false); mocks.member.mockResolvedValue(null);
});
describe("store cost UI permission props", () => {
  it("keeps OFF without membership lookup, including forged role and fixture query", async () => {
    expect(await access({ companyId, storeAccountId, role: "owner", fixture: "store-cost-owner" } as never)).toBeNull();
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it.each(["owner", "manager", "staff"])("derives %s edit visibility from verified membership", async role => {
    mocks.feature.mockReturnValue(true); mocks.member.mockResolvedValue({ role });
    expect(await access({ companyId, storeAccountId, role: "owner" } as never)).toEqual({ companyId, storeAccountId, canManage: role !== "staff" });
    expect(mocks.member).toHaveBeenCalledExactlyOnceWith({ companyId, storeAccountId });
  });
  it("remounts private state when the selected store changes", async () => {
    mocks.feature.mockReturnValue(true); mocks.member.mockResolvedValue({ role: "owner" });
    const first = await workspace();
    const second = await workspace({ companyId, storeAccountId: "20000000-0000-4000-8000-000000000002" });
    expect(first.key).not.toBe(second.key);
  });
  it("fails closed with guidance on missing membership or failed lookup", async () => {
    mocks.feature.mockReturnValue(true);
    expect(await access()).toEqual({ message: expect.stringContaining("로그인") });
    mocks.member.mockRejectedValueOnce(new Error("unavailable"));
    expect(await access()).toEqual({ message: expect.stringContaining("다시 시도") });
  });
});
