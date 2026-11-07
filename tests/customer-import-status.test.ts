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
let failReportSave = false;
let duplicateImportCustomer = false;
let existingUpdatedAt: string | null = null;
let manualConflict = false;
const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  atomic: process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED,
  manualAtomic: process.env.CUSTOMER_MANUAL_ATOMIC_RPC_ENABLED
};
let rpcFailures = 0;

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
    if (method === "POST" && path === "rpc/save_customer_import_atomic_draft") {
      if (rpcFailures-- > 0) return new Response("temporary", { status: 503 });
      return json([{ import_id: body.p_import_id, status: "completed", row_count: body.p_customers.length, error_message: null }]);
    }
    if (method === "POST" && path === "rpc/save_customer_manual_atomic_draft") {
      if (manualConflict) return json([{ import_id: body.p_import_id, status: "failed", conflict: true, customer: null, error_message: "customer_conflict" }]);
      return json([{ import_id: body.p_import_id, status: "completed", conflict: false, error_message: null, customer: {
        ...body.p_customer, company_id: body.p_company_id, id: body.p_customer_id || "customer-atomic", import_id: body.p_import_id
      } }]);
    }
    if (method === "GET" && path.startsWith("customer_imports?select=uploaded_file_id")) return json([{ uploaded_file_id: "file-atomic" }]);
    if (method === "PATCH" && path.startsWith("customer_imports?")) return new Response(null, { status: 204 });
    if (method === "POST" && path.startsWith("normalized_customers?")) {
      return failNormalizedSave ? new Response("save failed", { status: 500 }) : json([{ id: "customer-1", customer_name: "테스트 거래처", address: "서울" }], 201);
    }
    if (method === "POST" && path === "ai_reports") return failReportSave ? new Response("report failed", { status: 500 }) : json([{ id: "report-1" }], 201);
    if (method === "GET" && path.startsWith("normalized_customers?select=id,customer_name,address,normalized_key")) {
      return json(duplicateImportCustomer ? [{ id: "existing-1", customer_name: "테스트 거래처", address: "부산", normalized_key: "different" }] : []);
    }
    if (method === "GET" && path.startsWith("normalized_customers?select=id,updated_at")) {
      return json(existingCustomer ? [{ id: "customer-1", updated_at: existingUpdatedAt, delivery_manager: null, assigned_staff_member_id: null }] : []);
    }
    return json([]);
  }));
});

beforeEach(() => {
  calls.length = 0;
  existingCustomer = false;
  failNormalizedSave = false;
  failReportSave = false;
  duplicateImportCustomer = false;
  existingUpdatedAt = null;
  manualConflict = false;
  rpcFailures = 0;
  process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED = "false";
  process.env.CUSTOMER_MANUAL_ATOMIC_RPC_ENABLED = "false";
});

afterAll(() => {
  if (originalEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
  if (originalEnv.atomic === undefined) delete process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED; else process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED = originalEnv.atomic;
  if (originalEnv.manualAtomic === undefined) delete process.env.CUSTOMER_MANUAL_ATOMIC_RPC_ENABLED; else process.env.CUSTOMER_MANUAL_ATOMIC_RPC_ENABLED = originalEnv.manualAtomic;
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

  it("uses the separate atomic RPC for manual saves without pre-creating history", async () => {
    process.env.CUSTOMER_MANUAL_ATOMIC_RPC_ENABLED = "true";
    const result = await upsertCustomerMaster({ customerName: "테스트 거래처", address: "서울" }, "company-1");
    const rpcCall = calls.find(call => call.path === "rpc/save_customer_manual_atomic_draft");
    expect(result.persisted).toBe(true);
    expect(rpcCall?.body).toMatchObject({ p_company_id: "company-1", p_customer_id: null, p_expected_updated_at: null });
    expect((rpcCall?.body as { p_customer: Record<string, unknown> }).p_customer).not.toHaveProperty("company_id");
    expect(calls.some(call => call.method === "POST" && ["uploaded_files", "customer_imports"].includes(call.path))).toBe(false);
  });

  it("preserves expectedUpdatedAt conflict detection on the manual atomic path", async () => {
    process.env.CUSTOMER_MANUAL_ATOMIC_RPC_ENABLED = "true";
    existingCustomer = true;
    existingUpdatedAt = "2026-11-07T01:00:00.000Z";
    manualConflict = true;
    const result = await upsertCustomerMaster({
      customerName: "테스트 거래처",
      address: "서울",
      expectedUpdatedAt: existingUpdatedAt
    }, "company-1");
    const rpcCall = calls.find(call => call.path === "rpc/save_customer_manual_atomic_draft");
    expect(result).toMatchObject({ persisted: false, conflict: true });
    expect(rpcCall?.body).toMatchObject({
      p_company_id: "company-1",
      p_customer_id: "customer-1",
      p_expected_updated_at: existingUpdatedAt
    });
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

  it("uses the atomic RPC behind the default-off flag and retries the same request ID", async () => {
    process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED = "true";
    rpcFailures = 1;
    const result = await saveAnalysis([{ companyName: "테스트", customerName: "테스트 거래처", region: "서울", address: "서울",
      industry: "한식", monthlyRevenue: 1, lastOrderDays: 1, visitCount: 1, deliveryKm: 1 }], "테스트", {
      companyId: "company-1", uploadType: "customer-master"
    });
    const rpcCalls = calls.filter(call => call.path === "rpc/save_customer_import_atomic_draft");
    expect(result.persisted).toBe(true);
    expect(result.uploadedFileId).toBe("file-atomic");
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0].body).toEqual(rpcCalls[1].body);
    expect((rpcCalls[0].body as { p_customers: Array<Record<string, unknown>> }).p_customers[0]).not.toHaveProperty("company_id");
    expect(calls.some(call => call.method === "POST" && call.path === "customer_imports")).toBe(false);
  });

  it("returns a no-op without import history when every row is filtered as a duplicate", async () => {
    process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED = "true";
    duplicateImportCustomer = true;
    const result = await saveAnalysis([{ companyName: "테스트", customerName: "테스트 거래처", region: "서울", address: "서울",
      industry: "한식", monthlyRevenue: 1, lastOrderDays: 1, visitCount: 1, deliveryKm: 1 }], "테스트", {
      companyId: "company-1", uploadType: "customer-master"
    });
    expect(result.persisted).toBe(false);
    expect(result.importId).toBeUndefined();
    expect(calls.some(call => call.path === "rpc/save_customer_import_atomic_draft")).toBe(false);
  });

  it("keeps an atomic customer save successful when report post-processing fails", async () => {
    process.env.CUSTOMER_IMPORT_ATOMIC_RPC_ENABLED = "true";
    failReportSave = true;
    const result = await saveAnalysis([{ companyName: "테스트", customerName: "테스트 거래처", region: "서울", address: "서울",
      industry: "한식", monthlyRevenue: 1, lastOrderDays: 1, visitCount: 1, deliveryKm: 1 }], "테스트", {
      companyId: "company-1", uploadType: "customer-master"
    });
    expect(result.persisted).toBe(true);
    expect(result.pipeline.postProcessingWarning).toContain("거래처 저장은 완료");
    expect(result.pipeline.postProcessingWarning).not.toContain("report failed");
  });
});
