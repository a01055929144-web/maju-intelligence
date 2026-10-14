import { describe, expect, it } from "vitest";
import { isTelegramAccessFailure, telegramUpdateMatchesConnectionCode } from "../lib/telegram";

describe("telegram discovery", () => {
  const now = 2_000_000_000;

  it("matches a privacy-mode command containing the connection code", () => {
    expect(
      telegramUpdateMatchesConnectionCode(
        {
          message: {
            chat: { id: -100123, title: "배송 알림", type: "supergroup" },
            date: now - 10,
            text: "/connect@maju_bot MAJU-ABC123"
          }
        },
        "MAJU-ABC123",
        now
      )
    ).toBe(true);
  });

  it("rejects stale and private-chat updates", () => {
    expect(
      telegramUpdateMatchesConnectionCode(
        { message: { chat: { id: 123, type: "private" }, date: now - 10, text: "/connect@maju_bot MAJU-ABC123" } },
        "MAJU-ABC123",
        now
      )
    ).toBe(false);
    expect(
      telegramUpdateMatchesConnectionCode(
        { message: { chat: { id: -100123, type: "group" }, date: now - 86_401, text: "/connect@maju_bot MAJU-ABC123" } },
        "MAJU-ABC123",
        now
      )
    ).toBe(false);
  });
});

describe("telegram access failures", () => {
  it("recognizes Telegram permission and missing-chat failures", () => {
    expect(isTelegramAccessFailure("Forbidden: bot was kicked from the supergroup chat")).toBe(true);
    expect(isTelegramAccessFailure("Bad Request: chat not found")).toBe(true);
    expect(isTelegramAccessFailure("network timeout")).toBe(false);
  });
});
