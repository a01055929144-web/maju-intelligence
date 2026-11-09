import { afterEach, expect, it, vi } from "vitest";
import { documentRequest } from "../lib/pricing/document-client";

afterEach(() => vi.unstubAllGlobals());

it("keeps a failed proxy response readable and resends the same preparation key on explicit retry", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("synthetic gateway failure", { status: 502 }))
    .mockResolvedValueOnce(Response.json({ result: { publicUrl: "/pricing-document#synthetic" }, manager: true }));
  vi.stubGlobal("fetch", fetch);
  const input = { idempotencyKey: "40000000-0000-4000-8000-000000000001", leadId: null };
  await expect(documentRequest("company", "prepare-share", input, true)).rejects.toThrow("같은 요청으로 다시 시도");
  await expect(documentRequest("company", "prepare-share", input, true)).resolves.toMatchObject({ result: { publicUrl: "/pricing-document#synthetic" } });
  expect(fetch.mock.calls[0]).toEqual(fetch.mock.calls[1]);
});
