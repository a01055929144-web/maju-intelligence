import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({
  getSupabaseConfig: () => ({
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.SUPABASE_URL
  })
}));
import { getStageFQueue } from "../app/admin/operations/stage-f-read";

it.runIf(process.env.ADMIN_STAGE_F_POSTGREST === "isolated")("runs all six bounded queries against isolated PostgREST", async () => {
  const actualFetch = globalThis.fetch;
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    const upstream = url.replace("http://127.0.0.1:3002/rest/v1/", "http://127.0.0.1:3002/");
    return actualFetch(upstream, init);
  });

  const queue = await getStageFQueue("00000000-0000-4000-8000-0000000000a1");
  expect(urls).toHaveLength(6);
  for (const url of urls) {
    expect(url).toContain("company_id=eq.00000000-0000-4000-8000-0000000000a1");
    expect(url).toContain("limit=20");
  }
  expect(queue.map(({ count, ids, key, status }) => ({ count, ids: ids.length, key, status }))).toEqual([
    { count: 25, ids: 20, key: "uploads", status: "ready" },
    { count: 3, ids: 3, key: "products", status: "ready" },
    { count: 1, ids: 1, key: "links", status: "ready" },
    { count: 0, ids: 0, key: "orders", status: "ready" }
  ]);
});
