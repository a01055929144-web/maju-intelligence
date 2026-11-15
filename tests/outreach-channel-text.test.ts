import { describe, expect, it } from "vitest";
import { buildOutreachChannelText } from "../domains/lead/outreach-channel-text";

describe("outreach channel text", () => {
  it("marks SMS as long only above the 90-byte boundary", () => {
    expect(buildOutreachChannelText("sms", "a".repeat(90)).longSms).toBe(false);
    expect(buildOutreachChannelText("sms", "a".repeat(91)).longSms).toBe(true);
  });

  it("keeps a cafe comment short with exactly one selected link", () => {
    const link = "https://example.test/price";
    const result = buildOutreachChannelText("cafe_comment", `기존 문구 ${link} ${"가".repeat(100)} https://old.example.test/x`, link);
    expect(result.text.match(/https?:\/\/\S+/g)).toEqual([link]);
    expect(result.text.split("\n")[0].length).toBeLessThanOrEqual(80);
  });

  it.each(["instagram", "talktalk", "note"] as const)("adds a greeting, body and link for %s", (channel) => {
    const result = buildOutreachChannelText(channel, "가짜 상품 안내입니다.", "https://example.test/price");
    expect(result.text).toContain("안녕하세요.");
    expect(result.text).toContain("가짜 상품 안내입니다.");
    expect(result.text.match(/https?:\/\/\S+/g)).toHaveLength(1);
  });
});
