import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("invite phone check when Kakao gives no phone (11/3 23:44 incident)", () => {
  const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
  it("still rejects a mismatched Kakao phone", () => {
    expect(store).toContain("expectedLastFour && actualLastFour && expectedLastFour !== actualLastFour");
  });
  it("requires a signed last-four proof when Kakao gives no phone", () => {
    expect(store).toContain("expectedLastFour && !actualLastFour && !input.phoneLastFourVerified");
    const callback = readFileSync(resolve(process.cwd(), "app/api/auth/kakao/callback/route.ts"), "utf8");
    expect(callback).toContain("phoneLastFourVerified: await consumeInvitePhoneProof(inviteCode)");
    const api = readFileSync(resolve(process.cwd(), "app/api/auth/invite-phone/route.ts"), "utf8");
    expect(api).toContain("checkLoginThrottle");
  });
});
