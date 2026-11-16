import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/pricing/store-link-token", () => ({
  issueStoreLinkToken: () => ({ token: "signed-token", hash: "expected-hash" }),
}));

import { GET } from "../app/s/[code]/route";

const company = "00000000-0000-4000-8000-000000000001";
const link = "00000000-0000-4000-8000-000000000002";
const code = "Ab3xK9pQ2z";
const keys = ["SHORT_SHARE_LINKS", "SHORT_SHARE_LINKS_COMPANY_IDS", "STORE_LINK_SECRET"];
const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHORT_SHARE_LINKS = "true";
  process.env.SHORT_SHARE_LINKS_COMPANY_IDS = company;
  process.env.STORE_LINK_SECRET = "synthetic-local-test-secret-longer-than-32-characters";
});

afterEach(() => {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const open = (value = code, userAgent = "Mozilla/5.0 iPhone Mobile") =>
  GET(new Request(`https://store.example.test/s/${value}`, { headers: { "user-agent": userAgent, "x-forwarded-for": "192.0.2.10" } }), { params: Promise.resolve({ code: value }) });

it("does not touch the database while the feature is off", async () => {
  process.env.SHORT_SHARE_LINKS = "false";
  expect((await open()).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
});

it("returns the same unavailable response for malformed and unresolved codes", async () => {
  const malformed = await open("bad");
  mocks.db.mockResolvedValueOnce([]);
  const missing = await open();
  expect(malformed.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(await malformed.text()).toBe(await missing.text());
});

it("records a real mobile view through the resolver and redirects to the existing signed storefront", async () => {
  mocks.db
    .mockResolvedValueOnce([{ id: link, company_id: company, token_nonce: "a".repeat(32), token_hash: "expected-hash" }])
    .mockResolvedValueOnce({ status: "available", companyId: company, storefrontLinkId: link });
  const response = await open();
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://store.example.test/store#signed-token");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(JSON.parse(mocks.db.mock.calls[1][1].body)).toMatchObject({
    p_short_code: code,
    p_device_class: "mobile",
    p_is_preview_bot: false,
  });
});

it("marks Kakao preview requests so they do not increase views", async () => {
  mocks.db
    .mockResolvedValueOnce([{ id: link, company_id: company, token_nonce: "a".repeat(32), token_hash: "expected-hash" }])
    .mockResolvedValueOnce({ status: "unavailable" });
  await open(code, "KAKAOTALK-SCRAP/1.0");
  expect(JSON.parse(mocks.db.mock.calls[1][1].body).p_is_preview_bot).toBe(true);
});

it("does not call the tracking resolver for a company outside the allowlist", async () => {
  mocks.db.mockResolvedValueOnce([{ id: link, company_id: "00000000-0000-4000-8000-000000000099", token_nonce: "a".repeat(32), token_hash: "expected-hash" }]);
  expect((await open()).status).toBe(404);
  expect(mocks.db).toHaveBeenCalledTimes(1);
});
