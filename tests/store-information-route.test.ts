import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/store/07-store-information", () => ({ getStoreInformation: mocks.get, updateStoreInformation: mocks.update }));
import { GET, PATCH } from "../app/api/store/information/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
const url = `https://test/api/store/information?companyId=${companyId}&storeAccountId=${storeAccountId}`;
const request = (body: unknown, origin = "https://test") => new NextRequest(url, { method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("store information route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ companyId, storeAccountId, role: "owner" });
    mocks.get.mockResolvedValue({ businessRegistrationNumber: "1234567890", phone: "0212345678", representativeName: "홍대표", storeName: "홍매장" });
  });

  it("returns only the verified store information", async () => {
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canEdit: true, storeName: "홍매장" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows only an owner to update the scoped customer fields", async () => {
    mocks.context.mockResolvedValueOnce({ companyId, storeAccountId, role: "manager" });
    expect((await PATCH(request({ storeName: "수정", representativeName: "대표", phone: "010-1234-5678" }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await PATCH(request({ storeName: " 수정 매장 ", representativeName: " 대표 ", phone: "010-1234-5678" }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(companyId, storeAccountId, { storeName: "수정 매장", representativeName: "대표", phone: "01012345678" });
  });

  it("rejects another origin and invalid fields before membership access", async () => {
    expect((await PATCH(request({ storeName: "수정", representativeName: "", phone: "" }, "https://other"))).status).toBe(403);
    expect((await PATCH(request({ storeName: "", representativeName: "", phone: "123" }))).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
