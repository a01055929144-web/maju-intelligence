import { afterEach, describe, expect, it } from "vitest";
import { isSeoulOpenDataConfigured } from "../lib/seoul-restaurant";

describe("Seoul source preview flag", () => {
  const originalKey = process.env.SEOUL_OPENDATA_API_KEY;
  const originalFlag = process.env.LEAD_SEOUL_SOURCE_ENABLED;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SEOUL_OPENDATA_API_KEY;
    else process.env.SEOUL_OPENDATA_API_KEY = originalKey;
    if (originalFlag === undefined) delete process.env.LEAD_SEOUL_SOURCE_ENABLED;
    else process.env.LEAD_SEOUL_SOURCE_ENABLED = originalFlag;
  });

  it("stays disabled with a key while the preview flag is off", () => {
    process.env.SEOUL_OPENDATA_API_KEY = "configured-key";
    process.env.LEAD_SEOUL_SOURCE_ENABLED = "false";
    expect(isSeoulOpenDataConfigured()).toBe(false);
  });

  it("requires both the explicit preview flag and a non-placeholder key", () => {
    process.env.LEAD_SEOUL_SOURCE_ENABLED = "true";
    process.env.SEOUL_OPENDATA_API_KEY = "configured-key";
    expect(isSeoulOpenDataConfigured()).toBe(true);
  });
});
