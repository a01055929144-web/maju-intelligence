import { afterEach, describe, expect, it } from "vitest";
import { issueStoreLinkToken, verifyStoreLinkToken } from "../lib/pricing/store-link-token";

const previous = process.env.STORE_LINK_SECRET;
afterEach(() => { if (previous === undefined) delete process.env.STORE_LINK_SECRET;
  else process.env.STORE_LINK_SECRET = previous; });

describe("store bearer links", () => {
  it("regenerates the same link without storing its raw token", () => {
    process.env.STORE_LINK_SECRET = "test-only-secret-with-at-least-32-characters";
    const id = "9b96c8fb-6e9f-4f05-95b1-976c984b067d";
    const first = issueStoreLinkToken(id, "0123456789abcdef0123456789abcdef");
    expect(issueStoreLinkToken(id, first.nonce)).toEqual(first);
    expect(verifyStoreLinkToken(first.token)).toEqual({ id, nonce: first.nonce, hash: first.hash });
    expect(verifyStoreLinkToken(first.token.slice(0, -1) + (first.token.endsWith("0") ? "1" : "0"))).toBeNull();
  });
  it("does not issue a link without a private server secret", () => {
    delete process.env.STORE_LINK_SECRET;
    expect(() => issueStoreLinkToken("9b96c8fb-6e9f-4f05-95b1-976c984b067d")).toThrow();
  });
});
