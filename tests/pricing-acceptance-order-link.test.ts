import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));

import { acceptPricingDocument } from "../application/pricing/accept-pricing-document";
import { pricingAcceptanceRepository } from "../lib/pricing/acceptance-order-link";
import { verifyStoreLinkToken } from "../lib/pricing/store-link-token";

const command = {
  acceptedVia: "kakao_login" as const,
  companyId: "00000000-0000-4000-8000-000000000001",
  documentId: "10000000-0000-4000-8000-000000000001",
  documentVersionId: "20000000-0000-4000-8000-000000000001",
  idempotencyKey: "30000000-0000-4000-8000-000000000001",
  requestFingerprint: "fingerprint-000000000000000000000000000000000001",
};

describe("pricing acceptance to order-link contract", () => {
  beforeEach(() => {
    vi.stubEnv("STORE_LINK_SECRET", "test-secret-that-is-at-least-thirty-two-characters");
    supabaseRequest.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns a verified token from the single atomic RPC", async () => {
    supabaseRequest.mockImplementation(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return {
        customerId: "40000000-0000-4000-8000-000000000001",
        documentVersionId: command.documentVersionId,
        kind: "sheet",
        needsReview: false,
        orderEnabled: true,
        storefrontLinkId: body.p_link_id,
        storefrontTokenHash: body.p_link_hash,
        storefrontTokenNonce: body.p_link_nonce,
      };
    });

    const result = await acceptPricingDocument(pricingAcceptanceRepository, command);

    expect(supabaseRequest).toHaveBeenCalledOnce();
    expect(supabaseRequest.mock.calls[0][0]).toBe(
      "rpc/accept_pricing_document_and_issue_storefront_link",
    );
    expect(verifyStoreLinkToken(result.storefrontToken || "")).toMatchObject({
      id: result.storefrontLinkId,
    });
  });

  it("keeps ambiguous customer results link-free", async () => {
    supabaseRequest.mockResolvedValue({
      documentVersionId: command.documentVersionId,
      kind: "sheet",
      needsReview: true,
      orderEnabled: false,
    });
    await expect(
      acceptPricingDocument(pricingAcceptanceRepository, command),
    ).resolves.not.toHaveProperty("storefrontToken");
  });

  it("rejects malformed trusted-boundary identifiers before the repository", () => {
    const repository = { accept: vi.fn() };
    expect(() =>
      acceptPricingDocument(repository, { ...command, companyId: "other" }),
    ).toThrow("수락 요청을 확인해 주세요");
    expect(repository.accept).not.toHaveBeenCalled();
  });
});
