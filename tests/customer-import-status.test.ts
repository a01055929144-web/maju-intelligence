import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/place-links", () => ({
  resolveKakaoPlace: vi.fn(async () => null),
  resolvePlaceLinks: vi.fn(async () => ({
    checkedAt: null, enrichedIndustry: "", enrichedPhone: "", googleMapUrl: "", kakaoPlaceUrl: "", naverPlaceUrl: ""
  }))
}));

import { saveAnalysis, upsertCustomerMaster } from "../lib/store";

type RequestCall = { body: unknown; method: string; path: string };
const calls: RequestCall[] = [];
let existingCustomer = false;
let failNormalizedSave = false;
const originalEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function importStatuses() {
  return calls.filter(call => call.path.startsWith("customer_imports") && ["POST", "PATCH"].includes(call.method))
    .map(call => Array.isArray(call.body) ? call.body[0]?.status : (call.body as Record<string, unknown>)?.status);
}

beforeAll(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/rest/v1/", "") + url.search;
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ body, method, path });

    if (method === "POST" && path === "uploaded_files") return json([{ id: "file-1" }], 201);
    if (method === "POST" && path === "customer_imports") return json([{ id: "import-1" }], 201);
    if (method === "PATCH" && path.startsWith("customer_imports?")) return new Response(null, { status: 204 });
    if (method === "POST" && path.startsWith("normalized_customers?")) {
      return failNormalizedSave ? new Response("save failed", { status: 500 }) : json([{ id: "customer-1", customer_name: "테스트 거래처", address: "서울" }], 201);
    }
    if (method === "POST" && path === "ai_reports") return json([{ id: "report-1" }], 201);
    if (method === "GET" && path.startsWith("normalized_customers?select=id,updated_at")) {
      return json(existingCustomer ? [{ id: "customer-1", updated_at: null, delivery_manager: null, assigned_staff_member_id: null }] : []);
    }
    return json([]);
  }));
});

beforeEach(() => {
  calls.length = 0;
  existingCustomer = false;
  failNormalizedSave = false;
});

afterAll(() => {
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
  vi.unstubAllGlobals();
});

describe("customer import history status", () => {
  it("moves a manual create from processing to completed after saving the customer", async () => {
    const result = await upsertCustomerMaster({ customerName: "테스트 거래처", address: "서울" }, "company-1");
    expect(result.persisted).toBe(true);
    expect(importStatuses()).toEqual(["processing", "completed"]);
  });

  it("moves a failed manual update from processing to failed", async () => {
    existingCustomer = true;
    failNormalizedSave = true;
    await expect(upsertCustomerMaster({ customerName: "테스트 거래처", address: "서울" }, "company-1")).rejects.toThrow("save failed");
    expect(importStatuses()).toEqual(["processing", "failed"]);
  });

  it("moves a successful Excel import from processing to completed", async () => {
    const result = await saveAnalysis([{ companyName: "테스트", customerName: "테스트 거래처", region: "서울", address: "서울",
      industry: "한식", monthlyRevenue: 1, lastOrderDays: 1, visitCount: 1, deliveryKm: 1 }], "테스트", {
      companyId: "company-1", uploadType: "customer-master"
    });
    expect(result.persisted).toBe(true);
    expect(importStatuses()).toEqual(["processing", "completed"]);
  });

  it("moves an Excel batch failure from processing to failed", async () => {
    failNormalizedSave = true;
    const result = await saveAnalysis([{ companyName: "테스트", customerName: "테스트 거래처", region: "서울", address: "서울",
      industry: "한식", monthlyRevenue: 1, lastOrderDays: 1, visitCount: 1, deliveryKm: 1 }], "테스트", {
      companyId: "company-1", uploadType: "customer-master"
    });
    expect(result.persisted).toBe(false);
    expect(result.pipeline.normalizedBatchFailures).toHaveLength(1);
    expect(importStatuses()).toEqual(["processing", "failed"]);
  });
});
