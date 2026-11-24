import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../lib/pricing/document-share", () => ({ readDocumentSharePreview: mocks.read }));
import { GET } from "../app/q/[previewId]/image/route";
const id = "10000000-0000-4000-8000-000000000001";
const open = () => GET(new Request("https://fixture.test/q/" + id + "/image"), { params: Promise.resolve({ previewId: id }) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DOCUMENT_SHARE_BRANDING_COMPANY_IDS", ""); });
afterEach(() => { vi.unstubAllEnvs(); });
it("does not read metadata while the image feature is OFF", async () => {
  expect((await open()).status).toBe(404); expect(mocks.read).not.toHaveBeenCalled();
});
it.each([null, { title: "legacy lead preview", description: "" }])("never generates an image without verified allowlisted image fields", async value => {
  vi.stubEnv("DOCUMENT_SHARE_BRANDING_COMPANY_IDS", id); mocks.read.mockResolvedValue(value);
  expect((await open()).status).toBe(404);
});
it("renders a real PNG with only the approved public fields", async () => {
  vi.stubEnv("DOCUMENT_SHARE_BRANDING_COMPANY_IDS", id);
  mocks.read.mockResolvedValue({ title: "MAJU · 합성 유통 합성 단가표", description: "", image: {
    companyName: "합성 유통", title: "합성 단가표", itemCount: 12, validUntil: "2099-12-31",
  } });
  const response = await open(); expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("image/png");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const png = new Uint8Array(await response.arrayBuffer());
  expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer); expect(view.getUint32(16)).toBe(1200); expect(view.getUint32(20)).toBe(630);
  await mkdir("test-results/readonly-pg17/cx132-og", { recursive: true });
  await writeFile("test-results/readonly-pg17/cx132-og/store-share.png", png);
}, 60_000);

it("returns a private no-store failure without exposing database errors", async () => {
  vi.stubEnv("DOCUMENT_SHARE_BRANDING_COMPANY_IDS", id); mocks.read.mockRejectedValue(new Error("PRIVATE-database-detail"));
  const response = await open(); expect(response.status).toBe(404); expect(await response.text()).not.toContain("PRIVATE-");
});
