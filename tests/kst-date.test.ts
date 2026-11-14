import { describe, expect, it } from "vitest";
import { formatKstDate, isIsoDate, kstDateKey, kstToday } from "../domains/shared/kst-date";

describe("한국 날짜 (47-3)", () => {
  // 2026-11-14는 토요일. 한국 00:30 = UTC 전날 15:30.
  it("'오늘' 경계: 한국 00:30·08:59는 UTC로는 전날이지만 한국 날짜가 맞다", () => {
    expect(kstToday(new Date("2026-11-13T15:30:00Z"))).toBe("2026-11-14");
    expect(kstToday(new Date("2026-11-13T23:59:00Z"))).toBe("2026-11-14");
    expect(kstToday(new Date("2026-11-13T14:59:59Z"))).toBe("2026-11-13");
    expect(kstToday(new Date("2026-11-14T00:00:00Z"))).toBe("2026-11-14");
    expect(kstToday(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
  it("kstDateKey: ISO 문자열·숫자·잘못된 값", () => {
    expect(kstDateKey("2026-11-13T15:00:00.000Z")).toBe("2026-11-14");
    expect(kstDateKey(Date.UTC(2026, 10, 14, 0, 0))).toBe("2026-11-14");
    expect(kstDateKey("가짜")).toBe("");
  });
  it("formatKstDate: short · long · datetime", () => {
    const at = new Date("2026-11-14T13:38:00Z"); // 한국 22:38
    expect(formatKstDate(at, "short")).toBe("11/14(토)");
    expect(formatKstDate(at, "long")).toBe("2026. 11. 14.");
    expect(formatKstDate(at, "datetime")).toBe("11/14(토) 22:38");
    expect(formatKstDate(new Date("2026-11-13T15:05:00Z"), "datetime")).toBe("11/14(토) 00:05");
    expect(formatKstDate("가짜", "long")).toBe("");
  });
  it("isIsoDate: 형식과 실제 날짜", () => {
    expect(isIsoDate("2026-11-14")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-4")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});
