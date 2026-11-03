import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("staff table (11/3 23:44 feedback)", () => {
  const panel = readFileSync(resolve(process.cwd(), "app/dashboard/settings/staff-management-panel.tsx"), "utf8");
  it("drops summary cards, sorts by header, edits name and phone inline", () => {
    expect(panel).not.toContain("StaffSignal");
    expect(panel).toContain('toggleSort("name")');
    expect(panel).toContain("InlineTextCell");
    expect(panel).toContain(">직책{sortMark");
  });
  it("shares invites through KakaoTalk first and names the company in link previews", () => {
    expect(panel).toContain("shareToKakao");
    const join = readFileSync(resolve(process.cwd(), "app/mobile/join/page.tsx"), "utf8");
    expect(join).toContain("직원 초대");
    expect(join).toContain("generateMetadata");
  });
});
