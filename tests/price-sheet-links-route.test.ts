import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/pricing/document-share-feature", () => ({ documentSharingEnabled: () => true }));
import { GET } from "../app/api/sales-kit/price-sheet-links/route";

const company = "00000000-0000-4000-8000-000000000001";
const otherCompany = "00000000-0000-4000-8000-000000000002";
const shareId = "60000000-0000-4000-8000-000000000001";
const versionId = "20000000-0000-4000-8000-000000000001";

describe("published price sheet links", () => {
  beforeEach(async () => {
    vi.stubEnv("LEAD_DOCUMENT_LINK_SECRET", "synthetic-secret-longer-than-thirty-two-bytes");
    mocks.auth.mockReset().mockResolvedValue({ ok: true, companyId: company, role: "customer" });
    const { issueDocumentShareToken } = await import("../lib/pricing/document-share-token");
    const issued = issueDocumentShareToken(shareId, "a".repeat(32));
    mocks.db.mockReset().mockImplementation(async (path: string) => {
      if (path.startsWith("pricing_document_share_links?")) {
        expect(path).toContain(`company_id=eq.${company}`);
        expect(path).not.toContain(otherCompany);
        return [{ id: shareId, document_id: "10000000-0000-4000-8000-000000000001", document_version_id: versionId,
          token_hash: issued.hash, token_nonce: issued.nonce, created_at: "2026-11-15T01:00:00Z", expires_at: "2027-11-15T01:00:00Z" }];
      }
      if (path.startsWith("pricing_document_versions?")) return [{ id: versionId, content: { title: "가짜 11월 단가표" }, published_at: "2026-11-15T00:00:00Z" }];
      throw new Error(`Unexpected request ${path}`);
    });
  });

  it("uses the authenticated company even when another company is requested", async () => {
    const response = await GET(new NextRequest(`https://maju.example/api/sales-kit/price-sheet-links?companyId=${otherCompany}`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.links).toHaveLength(1);
    expect(body.links[0]).toMatchObject({ title: "가짜 11월 단가표", publishedAt: "2026-11-15T00:00:00Z" });
    expect(body.links[0].url).toMatch(/^https:\/\/maju\.example\/pricing-document#/);
  });

  it("rejects an unauthenticated request before reading links", async () => {
    mocks.auth.mockResolvedValue({ ok: false });
    const response = await GET(new NextRequest("https://maju.example/api/sales-kit/price-sheet-links"));
    expect(response.status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
