import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", async () => import("../lib/rate-limit"));
vi.mock("@/lib/store", () => ({
  getStaffInvitationPreview: vi.fn(async () => ({ companyName: "테스트 회사", employeeName: "테스트 직원" }))
}));

import { GET } from "../app/api/staff/invite-preview/route";

describe("staff invite preview rate limit", () => {
  it("returns normal responses through request 30 and 429 on request 31", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    for (let requestNumber = 1; requestNumber <= 30; requestNumber += 1) {
      const response = await GET(createRequest(ip));
      expect(response.status).toBe(200);
    }

    const blocked = await GET(createRequest(ip));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(await blocked.json()).toMatchObject({ preview: null });

    vi.unstubAllEnvs();
  });
});

function createRequest(ip: string) {
  return new NextRequest("https://example.test/api/staff/invite-preview?invite=test-code", {
    headers: { "x-forwarded-for": ip }
  });
}
